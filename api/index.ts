require("dotenv").config();
const { AuditLogger } = require("./auditlogger");
const express = require("express");
const app = express();
const { sql } = require("@vercel/postgres");
const db = require("./database.js");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const cors = require("cors");

const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

// Initialize Supabase clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Regular Supabase client
const supabase = createServerClient(supabaseUrl, supabaseKey, {
  cookies: {
    get: () => null,
    set: () => {},
    remove: () => {},
  },
});

// Admin Supabase client with service role key
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });

// Configure CORS to allow visits from development and production
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://guaranteeth-slides.vercel.app",
      "https://drivekind.info",
      "https://www.drivekind.info",
      /^https:\/\/.*\.vercel\.app$/,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Accept-Version",
      "Content-Length",
      "Content-MD5",
      "Date",
      "X-Api-Version",
    ],
  })
);

app.use(cookieParser());
app.use(
  session({
    genid: () => uuidv4(),
    secret:
      process.env.SESSION_SECRET || "fallback-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "strict",
    },
    name: "sessionId",
  })
);

app.use(express.static("public"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/", (req, res) => {
  res.status(200).send("Welcome to the Smile Design API");
});

// JWT Validation Middleware - now just validates JWT and extracts user token
const validateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log("Auth header received:", authHeader ? "Yes" : "No");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No valid auth header");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log("Token extracted, length:", token?.length);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      console.error("Token validation error:", error);
      return res.status(401).json({ error: "Invalid token" });
    }

    if (!user) {
      console.log("No user found for token");
      return res.status(401).json({ error: "Invalid token" });
    }

    console.log("Token validated for user:", user.id);
    req.user = user;
    req.userToken = token;
    next();
  } catch (error) {
    console.error("JWT validation error:", error);
    res.status(401).json({ error: "Token validation failed" });
  }
};

// Organization Access Middleware - still needed for getting org_id for inserts
const validateOrgAccess = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get user's organization from profiles table (still needed for inserts)
    const { data: profile, error } = await supabase
      .from("staff_profiles")
      .select("org_id")
      .eq("user_id", req.user.id)
      .single();

    if (error || !profile) {
      console.error("Profile lookup error:", error);
      return res.status(403).json({ error: "User profile not found" });
    }

    if (!profile.org_id) {
      return res
        .status(403)
        .json({ error: "User not assigned to an organization 1" });
    }

    // Attach org_id to request for use in inserts (still needed for new records)
    req.user.org_id = profile.org_id;
    next();
  } catch (error) {
    console.error("Organization validation error:", error);
    res.status(500).json({ error: "Organization validation failed" });
  }
};

// Combined middleware for JWT + Org validation
const validateJWTWithOrg = [validateJWT, validateOrgAccess];

// Admin Auth User Creation Endpoint
app.post("/admin/create-auth-user", validateJWT, async (req, res) => {
  try {
    const { email, password, first_name, last_name, profileData } = req.body;

    console.log("Creating auth user for:", email);

    // Verify admin role
    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('staff_profiles')
      .select('user_id, org_id, role')
      .eq('user_id', req.user.id)
      .single();

    if (adminProfileError || !adminProfile) {
      return res.status(404).json({ error: 'Admin profile not found' });
    }

    const hasAdminRole = adminProfile.role && (
      Array.isArray(adminProfile.role) 
        ? (adminProfile.role.includes('Admin') || adminProfile.role.includes('Super Admin'))
        : (adminProfile.role === 'Admin' || adminProfile.role === 'Super Admin')
    );

    if (!hasAdminRole) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Create auth user with service role key
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name,
        last_name,
      },
    });

    if (authError || !authData.user) {
      console.error("Auth creation error:", authError);
      return res.status(400).json({ error: authError?.message || 'Failed to create auth user' });
    }

    console.log("Auth user created successfully:", authData.user.id);

    // Create staff profile if profileData provided
    if (profileData) {
      console.log("Creating staff profile for:", authData.user.id);
      
      const staffProfile = {
        user_id: authData.user.id,
        org_id: adminProfile.org_id, // Use admin's org_id
        first_name,
        last_name,
        email,
        dob: profileData.dob || new Date().toISOString().split('T')[0],
        address: profileData.address || '',
        zipcode: parseFloat(profileData.zipcode) || 0,
        city: profileData.city || '',
        state: profileData.state || 'NY',
        user_name: email.split('@')[0],
        primary_phone: profileData.primary_phone || '',
        secondary_phone: profileData.secondary_phone || null,
        primary_is_cell: profileData.primary_is_cell ?? true,
        primary_can_text: profileData.primary_can_text ?? true,
        secondary_is_cell: profileData.secondary_is_cell ?? false,
        secondary_can_text: profileData.secondary_can_text ?? false,
        role: profileData.role || ['Driver'],
        address2: profileData.address2 || null,
        town_preference: profileData.town_preference || null,
        contact_pref_enum: profileData.contact_pref_enum || 'Phone',
        start_date: new Date().toISOString().split('T')[0],
        mileage_reimbursement: profileData.mileage_reimbursement ?? false,
        training_completed: profileData.training_completed ?? true,
        max_weekly_rides: profileData.max_weekly_rides || null,
        can_accept_service_animals: profileData.can_accept_service_animals ?? true,
        emergency_contact: profileData.emergency_contact || null,
        emergency_reln: profileData.emergency_reln || null,
        emergency_phone: profileData.emergency_phone || null,
        destination_limitation: profileData.destination_limitation || null,
        allergens: profileData.allergens || null,
        driver_other_limitations: profileData.driver_other_limitations || null
      };

      const { data: newProfile, error: insertError } = await supabaseAdmin
        .from('staff_profiles')
        .insert([staffProfile])
        .select()
        .single();

      if (insertError) {
        console.error('Profile insert error:', insertError);
        // Rollback: delete auth user
        console.log('Rolling back - deleting auth user:', authData.user.id);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(500).json({ error: `Failed to create profile: ${insertError.message}` });
      }

      console.log('Staff profile created successfully');
      
      res.json({ 
        success: true,
        user_id: authData.user.id, 
        profile: newProfile 
      });
    } else {
      // No profile data - just return auth user
      res.json({ 
        success: true,
        user_id: authData.user.id 
      });
    }

  } catch (error) {
    console.error("Error creating auth user:", error);
    res.status(500).json({ error: `Failed to create auth user: ${error.message}` });
  }
});

// Client routes
app.post("/clients", validateJWTWithOrg, async (req, res) => {
  try {
    const clientData = {
      ...req.body,
      org_id: req.user.org_id,
    };
    /* const client = await db.createClient(clientData, req.userToken); */
    const client = await AuditLogger.auditCreate({
      tableName: "clients",
      data: clientData,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "client_id",
    });
    res.status(201).json(client);
  } catch (error) {
    console.error("Error creating client:", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});

app.get("/clients", validateJWT, async (req, res) => {
  try {
    const clients = await db.getAllClients(req.userToken);
    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

//dashboard loading
app.get("/clients/dash", validateJWT, async (req, res) => {
  try {
    const clients = await db.getClientForAdminDash(req.userToken);
    res.json(clients);
  } catch (error) {
    console.error("Error Fetching clients:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/clients/:id", validateJWT, async (req, res) => {
  try {
    const client = await db.getClientById(req.params.id, req.userToken);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).json({ error: "Failed to fetch client" });
  }
});

app.put("/clients/:id", validateJWT, async (req, res) => {
  try {
    /* const client = await db.updateClient(
      req.params.id,
      req.body,
      req.userToken
    ); */
    //adding to log as well
    const client = await AuditLogger.auditUpdate({
      tableName: "clients",
      id: req.params.id,
      updates: req.body,
      userId: req.user.id,
      userToken: req.userToken,
      idField: "client_id",
    });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json(client);
  } catch (error) {
    console.error("Error updating client:", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});

app.delete("/clients/:id", validateJWT, async (req, res) => {
  try {
    /* await db.deleteClient(req.params.id, req.userToken); */
    await AuditLogger.auditDelete({
      tableName: "clients",
      id: req.params.id,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "client_id",
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

// Driver Unavailability routes
app.get("/driver-unavailability", validateJWT, async (req, res) => {
  try {
    const unavailabilities = await db.getAllDriverUnavailabilities(
      req.userToken
    );
    res.json(unavailabilities);
  } catch (error) {
    console.error("Error fetching driver unavailabilities:", error);
    res.status(500).json({ error: "Failed to fetch driver unavailabilities" });
  }
});

//testing with logger
app.post("/driver-unavailability", validateJWT, async (req, res) => {
  const unavailabilityData = {
    ...req.body,
    user_id: req.user.id,
  };
  try {
    /* const unavailabilities = await db.createDriverUnavailability(
      unavailabilityData,
      req.userToken
    ); */
    const unavailability = await AuditLogger.auditCreate({
      tableName: "driver_unavailability",
      data: unavailabilityData,
      userId: req.user.id,
      userToken: req.userToken,
      idField: "id",
    });
    res.status(201).json(/* unavailabilities */ unavailability);
  } catch (err) {
    console.error("Error creating driver unavailabilities:", err);
    res.status(500).json({ error: "Failed to create driver unavailabilities" });
  }
});
app.get("/driver-unavailability/by-user", validateJWT, async (req, res) => {
  try {
    const unavailability = await db.getDriverUnavailabilityByUId(
      req.user.id,
      req.userToken
    );
    if (!unavailability) {
      return res.status(404).json({ error: "Driver unavailability not found" });
    }
    res.json(unavailability);
  } catch (error) {
    console.error("Error fetching driver unavailability:", error);
    res.status(500).json({ error: "Failed to fetch driver unavailability" });
  }
});
app.get("/driver-unavailability/:id", validateJWT, async (req, res) => {
  try {
    const unavailability = await db.getDriverUnavailabilityById(
      req.params.id,
      req.userToken
    );
    if (!unavailability) {
      return res.status(404).json({ error: "Driver unavailability not found" });
    }
    res.json(unavailability);
  } catch (error) {
    console.error("Error fetching driver unavailability:", error);
    res.status(500).json({ error: "Failed to fetch driver unavailability" });
  }
});

app.put("/driver-unavailability/:id", validateJWT, async (req, res) => {
  try {
    const unavailability = await db.updateDriverUnavailability(
      req.params.id,
      req.body,
      req.userToken
    );
    if (!unavailability) {
      return res.status(404).json({ error: "Driver unavailability not found" });
    }
    res.json(unavailability);
  } catch (error) {
    console.error("Error updating driver unavailability:", error);
    res.status(500).json({ error: "Failed to update driver unavailability" });
  }
});

app.delete("/driver-unavailability/:id", validateJWT, async (req, res) => {
  try {
    /* await db.deleteDriverUnavailability(req.params.id, req.userToken); */
    await AuditLogger.auditDelete({
      tableName: "driver_unavailability",
      id: req.params.id,
      userId: req.user.id,
      userToken: req.userToken,
      idField: "id",
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting driver unavailability:", error);
    res.status(500).json({ error: "Failed to delete driver unavailability" });
  }
});

// Rides routes
app.get("/rides", validateJWT, async (req, res) => {
  try {
    const rides = await db.getAllRides(req.userToken);
    res.json(rides);
  } catch (error) {
    console.error("Error fetching rides:", error);
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

app.get("/rides/:ride_id", validateJWT, async (req, res) => {
  try {
    const ride = await db.getRideById(req.params.ride_id, req.userToken);
    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }
    res.json(ride);
  } catch (error) {
    console.error("Error fetching ride:", error);
    res.status(500).json({ error: "Failed to fetch ride" });
  }
});

app.put("/rides/:ride_id", validateJWT, async (req, res) => {
  try {
    const ride = await db.updateRide(
      req.params.ride_id,
      req.body,
      req.userToken
    );
    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }
    res.json(ride);
  } catch (error) {
    console.error("Error updating ride:", error);
    res.status(500).json({ error: "Failed to update ride" });
  }
});

app.delete("/rides/:ride_id", validateJWT, async (req, res) => {
  try {
    await db.deleteRide(req.params.ride_id, req.userToken);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting ride:", error);
    res.status(500).json({ error: "Failed to delete ride" });
  }
});

// Assign driver to ride
app.post("/rides/:ride_id/assign", validateJWT, async (req, res) => {
  try {
    const { driver_user_id } = req.body;
    const rideId = req.params.ride_id;

    console.log("Assigning driver:", driver_user_id, "to ride:", rideId);

    if (!driver_user_id) {
      return res.status(400).json({ error: "driver_user_id is required" });
    }

    // Get the driver's active vehicle (optional)
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("vehicle_id")
      .eq("user_id", driver_user_id)
      .eq("driver_status", "active")
      .limit(1)
      .maybeSingle();

    console.log("Found vehicle:", vehicle);

    // Update the ride with driver assignment
    const ride = await db.updateRide(
      rideId,
      {
        driver_user_id: driver_user_id,
        vehicle_id: vehicle?.vehicle_id || null,
        status: "Assigned",
      },
      req.userToken
    );

    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }

    console.log("Driver assigned successfully");
    res.json({ success: true, ride });
  } catch (error) {
    console.error("Error assigning driver:", error);
    res.status(500).json({ error: "Failed to assign driver" });
  }
});

// Calls routes
app.post("/calls", validateJWTWithOrg, async (req, res) => {
  try {
    const callData = {
      ...req.body,
      org_id: req.user.org_id,
      user_id: req.user.id,
    };
    /* const call = await db.createCall(callData, req.userToken); */
    const call = await AuditLogger.auditCreate({
      tableName: "calls",
      data: callData,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "call_id",
    });
    res.status(201).json(call);
  } catch (error) {
    console.error("Error creating call:", error);
    res.status(500).json({ error: "Failed to create call" });
  }
});

app.get("/calls", validateJWT, async (req, res) => {
  try {
    const calls = await db.getAllCalls(req.userToken);
    res.json(calls);
  } catch (error) {
    console.error("Error fetching calls:", error);
    res.status(500).json({ error: "Failed to fetch calls" });
  }
});

app.get("/calls/:id", validateJWT, async (req, res) => {
  try {
    const call = await db.getCallById(req.params.id, req.userToken);
    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }
    res.json(call);
  } catch (error) {
    console.error("Error fetching call:", error);
    res.status(500).json({ error: "Failed to fetch call" });
  }
});

app.put("/calls/:id", validateJWT, async (req, res) => {
  try {
    /*  const call = await db.updateCall(req.params.id, req.body, req.userToken); */
    const call = await AuditLogger.auditUpdate({
      tableName: "calls",
      id: req.params.id,
      updates: req.body,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "call_id",
    });
    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }
    res.json(call);
  } catch (error) {
    console.error("Error updating call:", error);
    res.status(500).json({ error: "Failed to update call" });
  }
});

app.delete("/calls/:id", validateJWT, async (req, res) => {
  try {
    /* await db.deleteCall(req.params.id, req.userToken); */
    await AuditLogger.auditDelete({
      tableName: "calls",
      id: req.params.id,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "call_id",
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting call:", error);
    res.status(500).json({ error: "Failed to delete call" });
  }
});

// Staff Profiles routes
app.post("/staff-profiles", validateJWT, async (req, res) => {
  try {
    const profileData = {
      ...req.body,
      // org_id should come from request body since we're creating the profile
      org_id: req.body.org_id || 1, // Use provided org_id or default to 1
    };
    const profile = await db.createStaffProfile(profileData, req.userToken);
    /* const profile = await AuditLogger.auditCreate({
      tableName: "staff_profiles",
      data: profileData,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "user_id",
    }); */
    res.status(201).json(profile);
  } catch (error) {
    console.error("Error creating staff profile:", error);
    res.status(500).json({ error: "Failed to create staff profile" });
  }
});

app.get("/staff-profiles", validateJWT, async (req, res) => {
  try {
    const profiles = await db.getAllStaffProfiles(req.userToken);
    res.json(profiles);
  } catch (error) {
    console.error("Error fetching staff profiles:", error);
    res.status(500).json({ error: "Failed to fetch staff profiles" });
  }
});

app.get("/staff-profiles/:id", validateJWT, async (req, res) => {
  try {
    const profile = await db.getStaffProfileById(req.params.id, req.userToken);
    if (!profile) {
      return res.status(404).json({ error: "Staff profile not found" });
    }
    res.json(profile);
  } catch (error) {
    console.error("Error fetching staff profile:", error);
    res.status(500).json({ error: "Failed to fetch staff profile" });
  }
});

app.put("/staff-profiles/:id", validateJWT, async (req, res) => {
  try {
    /* const profile = await db.updateStaffProfile(
      req.params.id,
      req.body,
      req.userToken
    ); */
    const profile = await AuditLogger.auditUpdate({
      tableName: "staff_profiles",
      id: req.params.id,
      updates: req.body,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "user_id",
    });
    if (!profile) {
      return res.status(404).json({ error: "Staff profile not found" });
    }
    res.json(profile);
  } catch (error) {
    console.error("Error updating staff profile:", error);
    res.status(500).json({ error: "Failed to update staff profile" });
  }
});

app.delete("/staff-profiles/:id", validateJWT, async (req, res) => {
  try {
    const userId = req.params.id;

    // First delete the staff profile from the database
    /* await db.deleteStaffProfile(userId, req.userToken); */
    await AuditLogger.auditDelete({
      tableName: "staff_profiles",
      id: userId,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "user_id",
    });
    // Then delete the auth user using admin client
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
      userId
    );

    if (authError) {
      console.error("Error deleting auth user:", authError);
      // Note: Staff profile is already deleted, so we still return success
      // but log the error for investigation
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting staff profile:", error);
    res.status(500).json({ error: "Failed to delete staff profile" });
  }
});

// Transactions Audit Log routes
app.post("/transactions-audit-log", validateJWTWithOrg, async (req, res) => {
  try {
    const logData = {
      ...req.body,
      org_id: req.user.org_id,
      user_id: req.user.id,
    };
    const logEntry = await db.createTransactionAuditLog(logData, req.userToken);
    res.status(201).json(logEntry);
  } catch (error) {
    console.error("Error creating transaction audit log:", error);
    res.status(500).json({ error: "Failed to create transaction audit log" });
  }
});

app.get("/transactions-audit-log", validateJWT, async (req, res) => {
  try {
    const logs = await db.getAllTransactionAuditLogs(req.userToken);
    res.json(logs);
  } catch (error) {
    console.error("Error fetching transaction audit logs:", error);
    res.status(500).json({ error: "Failed to fetch transaction audit logs" });
  }
});

app.get("/transactions-audit-log/:id", validateJWT, async (req, res) => {
  try {
    const log = await db.getTransactionAuditLogById(
      req.params.id,
      req.userToken
    );
    if (!log) {
      return res.status(404).json({ error: "Transaction audit log not found" });
    }
    res.json(log);
  } catch (error) {
    console.error("Error fetching transaction audit log:", error);
    res.status(500).json({ error: "Failed to fetch transaction audit log" });
  }
});

// Vehicles routes
app.post("/vehicles", validateJWTWithOrg, async (req, res) => {
  try {
    const vehicleData = {
      ...req.body,
      user_id: req.user.id,
      org_id: req.user.org_id, // ← REQUIRED for RLS/org scoping
    };
    /* const vehicle = await db.createVehicle(vehicleData, req.userToken); */
    const vehicle = await AuditLogger.auditCreate({
      tableName: "vehicles",
      data: vehicleData,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "vehicle_id", // ← FIX
    });
    res.status(201).json(vehicle);
  } catch (error) {
    console.error("Error creating vehicle:", error);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});

app.get("/vehicles", validateJWT, async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles(req.userToken);
    res.json(vehicles);
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

app.get("/vehicles/:id", validateJWT, async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id, req.userToken);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.json(vehicle);
  } catch (error) {
    console.error("Error fetching vehicle:", error);
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
});

app.put("/vehicles/:id", validateJWT, async (req, res) => {
  try {
    /* const vehicle = await db.updateVehicle(
      req.params.id,
      req.body,
      req.userToken
    ); */
    const vehicle = await AuditLogger.auditUpdate({
      tableName: "vehicles",
      id: req.params.id,
      updates: req.body,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "vehicle_id", // ← FIX
    });
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.json(vehicle);
  } catch (error) {
    console.error("Error updating vehicle:", error);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

app.delete("/vehicles/:id", validateJWT, async (req, res) => {
  try {
    /* await db.deleteVehicle(req.params.id, req.userToken); */
    await AuditLogger.auditDelete({
      tableName: "vehicles",
      id: req.params.id,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "vehicle_id", // ← FIX
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

// Organization routes
app.post("/organizations", validateJWT, async (req, res) => {
  try {
    /* const organization = await db.createOrganization(req.body, req.userToken); */
    const organization = await AuditLogger.auditCreate({
      tableName: "organizations",
      data: req.body,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "org_id", //potential fix
    });
    res.status(201).json(organization);
  } catch (error) {
    console.error("Error creating organization:", error);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

app.get("/organizations", validateJWT, async (req, res) => {
  try {
    const organizations = await db.getAllOrganizations(req.userToken);
    res.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

app.get("/organizations/:id", validateJWT, async (req, res) => {
  try {
    const organization = await db.getOrganizationById(
      req.params.id,
      req.userToken
    );
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json(organization);
  } catch (error) {
    console.error("Error fetching organization:", error);
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

app.put("/organizations/:id", validateJWT, async (req, res) => {
  try {
    /* const organization = await db.updateOrganization(
      req.params.id,
      req.body,
      req.userToken
    ); */
    const organization = await AuditLogger.auditUpdate({
      tableName: "organizations",
      id: req.params.id,
      updates: req.body,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "org_id",
    });
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json(organization);
  } catch (error) {
    console.error("Error updating organization:", error);
    res.status(500).json({ error: "Failed to update organization" });
  }
});

app.delete("/organizations/:id", validateJWT, async (req, res) => {
  try {
    /* await db.deleteOrganization(req.params.id, req.userToken); */
    await AuditLogger.auditDelete({
      tableName: "organizations",
      id: req.params.id,
      userId: req.userId || req.user.id,
      userToken: req.userToken,
      idField: "org_id",
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting organization:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
});

app.get("/volunteer/dash", validateJWT, async (req, res) => {
  try {
    const clients = await db.getVolunteerForAdminDash(req.userToken);
    res.json(clients);
  } catch (error) {
    console.error("Error Fetching volunteer:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/driver/dash", validateJWT, async (req, res) => {
  try {
    const clients = await db.getDriverForAdminDash(req.userToken);
    res.json(clients);
  } catch (error) {
    console.error("Error Fetching driver:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/dispatcher/dash", validateJWT, async (req, res) => {
  try {
    const clients = await db.getDispatcherForAdminDash(req.userToken);
    res.json(clients);
  } catch (error) {
    console.error("Error Fetching dispatchers:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/audit-log/dash", validateJWT, async (req, res) => {
  try {
    const [error, result] = await db.getAuditLogTable(req.userToken);
    if (error) {
      console.error("Database query error:", error);
      return res.status(500).json({
        success: false,
        error: "Error fetching data.",
      });
    }
    const formattedData = db.formatAuditLogData(result.data);
    res.json({
      success: true,
      data: formattedData,
      count: formattedData.length,
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({
      success: false,
      error: "Server error.",
    });
  }
});
app.get("/log/calls", validateJWT, async (req, res) => {
  try {
    const clients = await db.getCallTableForLog(req.userToken);
    res.json(clients);
  } catch (error) {
    console.error("Error Fetching dispatchers:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});
app.post("/log/deleteByTime", validateJWT, async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Provide Start Time and End Time",
      });
    }

    if (!req.userToken) {
      return res.status(401).json({
        success: false,
        message: "Need Authorization Token.",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid type of Date.",
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: "Start Time must be before End Time.",
      });
    }

    const result = await db.deleteLogsByTimeRange(
      req.userToken,
      startTime,
      endTime
    );
    res.json(result);
  } catch (error) {
    console.error("Error Fetching dispatchers:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.post("/log/previewByTime", validateJWT, async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Provide Start Time and End Time",
      });
    }

    if (!req.userToken) {
      return res.status(401).json({
        success: false,
        message: "Need Authorization Token.",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid type of Date.",
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: "Start Time must be before End Time.",
      });
    }

    const result = await db.previewLogsByTimeRange(
      req.userToken,
      startTime,
      endTime
    );
    res.json(result);
  } catch (error) {
    console.error("Error Fetching dispatchers:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/reports/rides/stats", validateJWT, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "start_date and end_date are required" });
    }

    const stats = await db.getDriverRideStats(
      req.user.id,
      start_date,
      end_date,
      req.userToken
    );

    res.json(stats);
  } catch (error) {
    console.error("Error fetching ride stats:", error);
    res.status(500).json({ error: "Failed to fetch ride statistics" });
  }
});

// Confirm ride completion (dispatcher confirms driver's report)
app.post("/rides/:rideId/confirm", validateJWT, async (req, res) => {
  try {
    const rideId = parseInt(req.params.rideId);
    const {
      hours,
      miles_driven,
      donation_received,
      donation_amount,
      completion_status,
      comments,
    } = req.body;

    // Verify dispatcher/admin role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, org_id, role")
      .eq("user_id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const hasDispatcherRole =
      profile.role &&
      (Array.isArray(profile.role)
        ? profile.role.includes("Dispatcher") || profile.role.includes("Admin")
        : profile.role === "Dispatcher" || profile.role === "Admin");

    if (!hasDispatcherRole) {
      return res
        .status(403)
        .json({ error: "Access denied. Dispatcher or Admin role required." });
    }

    // Verify the ride exists and is in Reported status
    const { data: existingRide, error: rideError } = await supabaseAdmin
      .from("rides")
      .select("ride_id, org_id, status")
      .eq("ride_id", rideId)
      .eq("org_id", profile.org_id)
      .single();

    if (rideError || !existingRide) {
      return res.status(404).json({ error: "Ride not found or access denied" });
    }

    if (existingRide.status !== "Reported") {
      return res
        .status(400)
        .json({ error: "Ride must be in Reported status to confirm" });
    }

    // Update the ride status to Completed with all details
    const { error: updateError } = await supabaseAdmin
      .from("rides")
      .update({
        status: "Completed",
        hours: hours || null,
        miles_driven: miles_driven || null,
        donation: donation_received || false,
        donation_amount:
          donation_received && donation_amount ? donation_amount : null,
        completion_status: completion_status || null,
      })
      .eq("ride_id", rideId);

    if (updateError) {
      console.error("Error confirming ride completion:", updateError);
      return res
        .status(500)
        .json({ error: "Failed to confirm ride completion" });
    }

    // Update completed rides record
    const { error: completedError } = await supabaseAdmin
      .from("completedrides")
      .update({
        hours: hours || null,
        miles_driven: miles_driven || null,
        donation_amount:
          donation_received && donation_amount ? donation_amount : null,
        comments: comments || null,
      })
      .eq("ride_id", rideId);

    if (completedError) {
      console.error("Error updating completed ride record:", completedError);
      // Don't fail the request, just log the error
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error confirming ride completion:", error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// Driver matching algorithm endpoint
app.post("/rides/:rideId/match-drivers", validateJWT, async (req, res) => {
  try {
    const rideId = parseInt(req.params.rideId);

    // Verify dispatcher/admin role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('staff_profiles')
      .select('user_id, org_id, role')
      .eq('user_id', req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const hasDispatcherRole = profile.role && (
      Array.isArray(profile.role) 
        ? (profile.role.includes('Dispatcher') || profile.role.includes('Admin'))
        : (profile.role === 'Dispatcher' || profile.role === 'Admin')
    );

    if (!hasDispatcherRole) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the ride details with client information
    // IMPORTANT: Service role bypasses RLS, but we still need to verify org ownership
    const { data: ride, error: rideError } = await supabaseAdmin
      .from('rides')
      .select(`
        *,
        clients:client_id (
          service_animal,
          service_animal_size_enum,
          oxygen,
          car_height_needed_enum,
          zip_code,
          street_address,
          city,
          state
        )
      `)
      .eq('ride_id', rideId)
      .single();

    if (rideError || !ride) {
      console.error('Ride fetch error:', rideError);
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Verify the ride belongs to the dispatcher's organization
    if (ride.org_id !== profile.org_id) {
      console.error(`Org mismatch: ride org ${ride.org_id} vs user org ${profile.org_id}`);
      return res.status(403).json({ error: 'Access denied: ride not in your organization' });
    }

    console.log('Matching drivers for ride:', rideId, 'in org:', profile.org_id);


    // Get all drivers in the organization
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from("staff_profiles")
      .select(
        `
        user_id,
        first_name,
        last_name,
        zipcode,
        last_drove,
        max_weekly_rides,
        can_accept_service_animals,
        town_preference,
        destination_limitation
      `
      )
      .eq("org_id", profile.org_id)
      .contains("role", ["Driver"]);

    if (driversError) {
      console.error("Error fetching drivers:", driversError);
      return res.status(500).json({ error: "Failed to fetch drivers" });
    }

    console.log(`Found ${drivers?.length || 0} drivers in organization`);

    // Get ALL vehicles for these drivers (separate query for better control)
    const { data: allVehicles, error: vehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .in(
        "user_id",
        drivers.map((d) => d.user_id)
      );

    if (vehiclesError) {
      console.error("Error fetching vehicles:", vehiclesError);
    }

    console.log(`Found ${allVehicles?.length || 0} total vehicles`);

    // Log a sample vehicle to see the structure
    if (allVehicles && allVehicles.length > 0) {
      console.log("Sample vehicle:", JSON.stringify(allVehicles[0], null, 2));
    }

    // Create a map of user_id to their vehicles
    const vehiclesByUser = {};
    if (allVehicles) {
      allVehicles.forEach((vehicle) => {
        if (!vehiclesByUser[vehicle.user_id]) {
          vehiclesByUser[vehicle.user_id] = [];
        }
        vehiclesByUser[vehicle.user_id].push(vehicle);
      });
    }

    // Log vehicle status breakdown (with actual enum values)
    const vehicleStatusCounts = {};
    allVehicles?.forEach((v) => {
      const status = v.driver_status; // Keep original case for counting
      vehicleStatusCounts[status] = (vehicleStatusCounts[status] || 0) + 1;
    });
    console.log("Vehicle status breakdown:", vehicleStatusCounts);

    // Get unavailability for all drivers
    const rideDate = new Date(ride.appointment_time);
    const rideDayOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][rideDate.getDay()];

    const { data: unavailability, error: unavailError } = await supabaseAdmin
      .from("driver_unavailability")
      .select("*")
      .in(
        "user_id",
        drivers.map((d) => d.user_id)
      )
      .or(
        `unavailable_date.eq.${
          rideDate.toISOString().split("T")[0]
        },repeating_day.eq.${rideDayOfWeek}`
      );

    if (unavailError) {
      console.error("Error fetching unavailability:", unavailError);
    }

    // Get recent ride counts for each driver (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentRides, error: recentRidesError } = await supabaseAdmin
      .from("rides")
      .select("driver_user_id")
      .in(
        "driver_user_id",
        drivers.map((d) => d.user_id)
      )
      .gte("appointment_time", sevenDaysAgo.toISOString())
      .in("status", [
        "Scheduled",
        "Assigned",
        "In Progress",
        "Completed",
        "Pending",
      ]);

    const recentRideCounts = {};
    if (recentRides) {
      recentRides.forEach((r) => {
        recentRideCounts[r.driver_user_id] =
          (recentRideCounts[r.driver_user_id] || 0) + 1;
      });
    }

    // Match drivers
    const rideTime = new Date(ride.appointment_time);
    const rideHour = rideTime.getHours();
    const rideMinute = rideTime.getMinutes();
    const rideTimeString = `${String(rideHour).padStart(2, "0")}:${String(
      rideMinute
    ).padStart(2, "0")}:00`;

    const matchedDrivers = drivers.map((driver) => {
      const result = {
        user_id: driver.user_id,
        first_name: driver.first_name,
        last_name: driver.last_name,
        score: 0,
        match_quality: "excellent",
        reasons: [],
        exclusion_reasons: [],
      };

      // HARD FILTERS

      // 1. Check schedule availability
      const driverUnavail =
        unavailability?.filter((u) => u.user_id === driver.user_id) || [];
      const isUnavailable = driverUnavail.some((u) => {
        if (u.all_day) return true;
        if (u.start_time && u.end_time) {
          return rideTimeString >= u.start_time && rideTimeString <= u.end_time;
        }
        return false;
      });

      if (isUnavailable) {
        result.exclusion_reasons.push("Driver unavailable at requested time");
        result.match_quality = "excluded";
        return result;
      }

      // 2. Check vehicle availability and capacity
      const driverVehicles = vehiclesByUser[driver.user_id] || [];

      // Filter for Active vehicles (matching the enum exactly)
      const activeVehicles = driverVehicles.filter((v) => {
        // Handle both 'Active' and 'active' just in case
        const status = v.driver_status;
        return status === "Active" || status === "active";
      });

      console.log(
        `Driver ${driver.first_name} ${driver.last_name} (${driver.user_id}): ${driverVehicles.length} total vehicles, ${activeVehicles.length} active`
      );

      // Log the actual statuses if there are vehicles but none active
      if (driverVehicles.length > 0 && activeVehicles.length === 0) {
        console.log(
          `  Vehicle statuses: ${driverVehicles
            .map((v) => v.driver_status)
            .join(", ")}`
        );
      }

      if (activeVehicles.length === 0) {
        if (driverVehicles.length === 0) {
          result.exclusion_reasons.push("No vehicle registered");
        } else {
          const statuses = driverVehicles
            .map((v) => v.driver_status)
            .join(", ");
          result.exclusion_reasons.push(
            `No active vehicle (has ${driverVehicles.length} vehicle(s) with status: ${statuses})`
          );
        }
        result.match_quality = "excluded";
        return result;
      }

      // Check capacity
      const hasCapacity = activeVehicles.some(
        (v) => v.nondriver_seats >= (ride.riders || 1)
      );
      if (!hasCapacity) {
        result.exclusion_reasons.push(
          `Insufficient capacity (needs ${ride.riders || 1} seats)`
        );
        result.match_quality = "excluded";
        return result;
      }

      // 3. Check special requirements
      if (ride.clients?.service_animal && !driver.can_accept_service_animals) {
        result.exclusion_reasons.push("Cannot accommodate service animal");
        result.match_quality = "excluded";
        return result;
      }

      if (ride.clients?.oxygen) {
        // Assuming oxygen capability is not currently tracked, but could be added
        // For now, we'll allow all drivers
      }

      // 4. Check vehicle height requirement
      if (
        ride.clients?.car_height_needed_enum &&
        ride.clients.car_height_needed_enum !== "Standard" &&
        ride.clients.car_height_needed_enum !== "low"
      ) {
        const hasRequiredHeight = activeVehicles.some((v) => {
          if (
            ride.clients.car_height_needed_enum === "Tall" ||
            ride.clients.car_height_needed_enum === "high"
          ) {
            return (
              v.seat_height_enum === "High" ||
              v.seat_height_enum === "high" ||
              v.type_of_vehicle_enum === "SUV"
            );
          }
          return true;
        });

        if (!hasRequiredHeight) {
          result.exclusion_reasons.push("Vehicle height requirement not met");
          result.match_quality = "excluded";
          return result;
        }
      }

      // 5. Geography check (simplified - check if same ZIP or nearby)
      const driverZip = String(driver.zipcode);
      const pickupZip = ride.pickup_from_home
        ? ride.clients?.zip_code
        : ride.alt_pickup_zipcode;
      const dropoffZip = ride.dropoff_zipcode;

      // Simple proximity check (first 3 digits of ZIP)
      const driverArea = driverZip.substring(0, 3);
      const pickupArea = pickupZip?.substring(0, 3);
      const dropoffArea = dropoffZip?.substring(0, 3);

      const inServiceArea =
        driverArea === pickupArea || driverArea === dropoffArea;

      if (!inServiceArea) {
        // Check destination limitations
        if (driver.destination_limitation) {
          result.exclusion_reasons.push("Outside service area");
          result.match_quality = "excluded";
          return result;
        }
      }

      // PASSED ALL HARD FILTERS - Calculate score

      // Fairness: Rotation (last_drove) - most important
      const lastDrove = driver.last_drove
        ? new Date(driver.last_drove).getTime()
        : 0;
      const daysSinceLastDrive = lastDrove
        ? (Date.now() - lastDrove) / (1000 * 60 * 60 * 24)
        : 9999;

      // Score: 0-100 points for rotation
      if (daysSinceLastDrive > 30) {
        result.score += 100;
        result.reasons.push("High priority in rotation queue");
      } else if (daysSinceLastDrive > 14) {
        result.score += 75;
        result.reasons.push("Medium priority in rotation queue");
      } else if (daysSinceLastDrive > 7) {
        result.score += 50;
      } else {
        result.score += Math.max(0, daysSinceLastDrive * 5);
      }

      // Balance: Recent assignment count - 0-30 points
      const recentCount = recentRideCounts[driver.user_id] || 0;
      const maxWeekly = driver.max_weekly_rides || 10;

      if (recentCount === 0) {
        result.score += 30;
        result.reasons.push("No recent assignments");
      } else if (recentCount < maxWeekly / 2) {
        result.score += 20;
      } else if (recentCount < maxWeekly) {
        result.score += 10;
      } else {
        result.score += 0;
        result.reasons.push(
          `Approaching weekly limit (${recentCount}/${maxWeekly})`
        );
      }

      // Proximity: Same ZIP area - 0-20 points
      if (driverArea === pickupArea) {
        result.score += 20;
        result.reasons.push("Lives near pickup location");
      } else if (driverArea === dropoffArea) {
        result.score += 10;
        result.reasons.push("Lives near dropoff location");
      }

      // Town preference match - 0-10 points
      if (driver.town_preference) {
        const preferredTowns = driver.town_preference
          .toLowerCase()
          .split(",")
          .map((t) => t.trim());
        const dropoffCity = ride.dropoff_city?.toLowerCase();

        if (preferredTowns.includes(dropoffCity)) {
          result.score += 10;
          result.reasons.push("Matches town preference");
        }
      }

      // Determine match quality based on score
      if (result.score >= 90) {
        result.match_quality = "excellent";
      } else if (result.score >= 60) {
        result.match_quality = "good";
      } else if (result.score >= 30) {
        result.match_quality = "fair";
      } else {
        result.match_quality = "poor";
      }

      return result;
    });

    // Separate excluded and available drivers
    const availableDrivers = matchedDrivers
      .filter((d) => d.match_quality !== "excluded")
      .sort((a, b) => b.score - a.score);

    const excludedDrivers = matchedDrivers
      .filter((d) => d.match_quality === "excluded")
      .sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(
          `${b.first_name} ${b.last_name}`
        )
      );

    console.log(
      `Match results: ${availableDrivers.length} available, ${excludedDrivers.length} excluded`
    );

    res.json({
      success: true,
      available: availableDrivers,
      excluded: excludedDrivers,
      ride_requirements: {
        riders: ride.riders || 1,
        service_animal: ride.clients?.service_animal || false,
        oxygen: ride.clients?.oxygen || false,
        vehicle_height: ride.clients?.car_height_needed_enum,
        appointment_time: ride.appointment_time,
      },
    });
  } catch (error) {
    console.error("Error in driver matching:", error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// Send ride request to selected driver
app.post("/rides/:rideId/send-request", validateJWT, async (req, res) => {
  try {
    const rideId = parseInt(req.params.rideId);
    const { driver_user_id } = req.body;

    if (!driver_user_id) {
      return res.status(400).json({ error: "driver_user_id is required" });
    }

    // Verify dispatcher/admin role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, org_id, role")
      .eq("user_id", req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const hasDispatcherRole =
      profile.role &&
      (Array.isArray(profile.role)
        ? profile.role.includes("Dispatcher") || profile.role.includes("Admin")
        : profile.role === "Dispatcher" || profile.role === "Admin");

    if (!hasDispatcherRole) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify the ride exists
    const { data: existingRide, error: rideError } = await supabaseAdmin
      .from("rides")
      .select("ride_id, org_id, status")
      .eq("ride_id", rideId)
      .eq("org_id", profile.org_id)
      .single();

    if (rideError || !existingRide) {
      return res.status(404).json({ error: "Ride not found or access denied" });
    }

    if (existingRide.status !== "Requested") {
      return res
        .status(400)
        .json({
          error: "Can only send requests for rides with Requested status",
        });
    }

    // Verify the driver exists and is in the same org
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, org_id, role")
      .eq("user_id", driver_user_id)
      .eq("org_id", profile.org_id)
      .single();

    if (driverError || !driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const hasDriverRole =
      driver.role &&
      (Array.isArray(driver.role)
        ? driver.role.includes("Driver")
        : driver.role === "Driver");

    if (!hasDriverRole) {
      return res.status(400).json({ error: "Selected user is not a driver" });
    }

    // Update the ride - assign driver and change status to Pending
    const { error: updateError } = await supabaseAdmin
      .from("rides")
      .update({
        driver_user_id: driver_user_id,
        status: "Pending", // New status for ride requests awaiting driver acceptance
      })
      .eq("ride_id", rideId);

    if (updateError) {
      console.error("Update error:", updateError);
      return res
        .status(500)
        .json({ error: `Failed to send ride request: ${updateError.message}` });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error sending ride request:", error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// Driver accepts ride request
app.post("/rides/:rideId/accept", validateJWT, async (req, res) => {
  try {
    const rideId = parseInt(req.params.rideId);

    // Get the ride
    const { data: ride, error: rideError } = await supabaseAdmin
      .from("rides")
      .select("ride_id, driver_user_id, status, vehicle_id")
      .eq("ride_id", rideId)
      .single();

    if (rideError || !ride) {
      return res.status(404).json({ error: "Ride not found" });
    }

    // Verify the ride is assigned to this driver
    if (ride.driver_user_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "This ride is not assigned to you" });
    }

    if (ride.status !== "Pending") {
      return res
        .status(400)
        .json({ error: "Can only accept rides with Pending status" });
    }

    // Get driver's active vehicle if not already assigned
    let vehicleId = ride.vehicle_id;
    if (!vehicleId) {
      const { data: vehicle } = await supabaseAdmin
        .from("vehicles")
        .select("vehicle_id")
        .eq("user_id", req.user.id)
        .eq("driver_status", "active")
        .limit(1)
        .maybeSingle();

      vehicleId = vehicle?.vehicle_id || null;
    }

    // Update ride to Scheduled and assign vehicle
    const { error: updateError } = await supabaseAdmin
      .from("rides")
      .update({
        status: "Scheduled",
        vehicle_id: vehicleId,
      })
      .eq("ride_id", rideId);

    if (updateError) {
      console.error("Error accepting ride:", updateError);
      return res.status(500).json({ error: "Failed to accept ride" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in ride acceptance:", error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// Driver declines ride request
app.post("/rides/:rideId/decline", validateJWT, async (req, res) => {
  try {
    const rideId = parseInt(req.params.rideId);
    const { reason } = req.body;

    // Get the ride
    const { data: ride, error: rideError } = await supabaseAdmin
      .from("rides")
      .select("ride_id, driver_user_id, status")
      .eq("ride_id", rideId)
      .single();

    if (rideError || !ride) {
      return res.status(404).json({ error: "Ride not found" });
    }

    // Verify the ride is assigned to this driver
    if (ride.driver_user_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "This ride is not assigned to you" });
    }

    if (ride.status !== "Pending") {
      return res
        .status(400)
        .json({ error: "Can only decline rides with Pending status" });
    }

    // Update ride back to Requested and remove driver assignment
    const { error: updateError } = await supabaseAdmin
      .from("rides")
      .update({
        status: "Requested",
        driver_user_id: null,
        notes: ride.notes
          ? `${ride.notes}\n[Driver declined: ${
              reason || "No reason provided"
            }]`
          : `[Driver declined: ${reason || "No reason provided"}]`,
      })
      .eq("ride_id", rideId);

    if (updateError) {
      console.error("Error declining ride:", updateError);
      return res.status(500).json({ error: "Failed to decline ride" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in ride decline:", error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;
