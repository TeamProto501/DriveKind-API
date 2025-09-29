require("dotenv").config();

const express = require("express");
const app = express();
const { sql } = require("@vercel/postgres");
const db = require("./database.js");
const { createServerClient } = require("@supabase/ssr");
const cors = require("cors");

const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

// Initialize single Supabase client instance
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createServerClient(supabaseUrl, supabaseKey, {
  cookies: {
    get: () => null,
    set: () => {},
    remove: () => {},
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = user;
    req.userToken = token; // Store token for passing to database functions
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
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", req.user.id)
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

// Client routes
app.post("/clients", validateJWTWithOrg, async (req, res) => {
  try {
    const clientData = {
      ...req.body,
      org_id: req.user.org_id,
      user_id: req.user.id,
    };
    const client = await db.createClient(clientData, req.userToken);
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
    const client = await db.updateClient(
      req.params.id,
      req.body,
      req.userToken
    );
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
    await db.deleteClient(req.params.id, req.userToken);
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
    await db.deleteDriverUnavailability(req.params.id, req.userToken);
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

// Calls routes
app.post("/calls", validateJWTWithOrg, async (req, res) => {
  try {
    const callData = {
      ...req.body,
      org_id: req.user.org_id,
      user_id: req.user.id,
    };
    const call = await db.createCall(callData, req.userToken);
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
    const call = await db.updateCall(req.params.id, req.body, req.userToken);
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
    await db.deleteCall(req.params.id, req.userToken);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting call:", error);
    res.status(500).json({ error: "Failed to delete call" });
  }
});

// Timecards routes
app.post("/timecards", validateJWTWithOrg, async (req, res) => {
  try {
    const timecardData = {
      ...req.body,
      org_id: req.user.org_id,
      user_id: req.user.id,
    };
    const timecard = await db.createTimecard(timecardData, req.userToken);
    res.status(201).json(timecard);
  } catch (error) {
    console.error("Error creating timecard:", error);
    res.status(500).json({ error: "Failed to create timecard" });
  }
});

app.get("/timecards", validateJWT, async (req, res) => {
  try {
    const timecards = await db.getAllTimecards(req.userToken);
    res.json(timecards);
  } catch (error) {
    console.error("Error fetching timecards:", error);
    res.status(500).json({ error: "Failed to fetch timecards" });
  }
});

app.get("/timecards/:id", validateJWT, async (req, res) => {
  try {
    const timecard = await db.getTimecardById(req.params.id, req.userToken);
    if (!timecard) {
      return res.status(404).json({ error: "Timecard not found" });
    }
    res.json(timecard);
  } catch (error) {
    console.error("Error fetching timecard:", error);
    res.status(500).json({ error: "Failed to fetch timecard" });
  }
});

app.put("/timecards/:id", validateJWT, async (req, res) => {
  try {
    const timecard = await db.updateTimecard(
      req.params.id,
      req.body,
      req.userToken
    );
    if (!timecard) {
      return res.status(404).json({ error: "Timecard not found" });
    }
    res.json(timecard);
  } catch (error) {
    console.error("Error updating timecard:", error);
    res.status(500).json({ error: "Failed to update timecard" });
  }
});

app.delete("/timecards/:id", validateJWT, async (req, res) => {
  try {
    await db.deleteTimecard(req.params.id, req.userToken);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting timecard:", error);
    res.status(500).json({ error: "Failed to delete timecard" });
  }
});

// Timecards routes
app.post("/timecards", validateJWTWithOrg, async (req, res) => {
  try {
    const timecardData = {
      ...req.body,
      org_id: req.user.org_id,
      user_id: req.user.id,
    };
    const timecard = await db.createTimecard(timecardData, req.userToken);
    res.status(201).json(timecard);
  } catch (error) {
    console.error("Error creating timecard:", error);
    res.status(500).json({ error: "Failed to create timecard" });
  }
});

app.get("/timecards", validateJWT, async (req, res) => {
  try {
    const timecards = await db.getAllTimecards(req.userToken);
    res.json(timecards);
  } catch (error) {
    console.error("Error fetching timecards:", error);
    res.status(500).json({ error: "Failed to fetch timecards" });
  }
});

app.get("/timecards/:id", validateJWT, async (req, res) => {
  try {
    const timecard = await db.getTimecardById(req.params.id, req.userToken);
    if (!timecard) {
      return res.status(404).json({ error: "Timecard not found" });
    }
    res.json(timecard);
  } catch (error) {
    console.error("Error fetching timecard:", error);
    res.status(500).json({ error: "Failed to fetch timecard" });
  }
});

app.put("/timecards/:id", validateJWT, async (req, res) => {
  try {
    const timecard = await db.updateTimecard(
      req.params.id,
      req.body,
      req.userToken
    );
    if (!timecard) {
      return res.status(404).json({ error: "Timecard not found" });
    }
    res.json(timecard);
  } catch (error) {
    console.error("Error updating timecard:", error);
    res.status(500).json({ error: "Failed to update timecard" });
  }
});

app.delete("/timecards/:id", validateJWT, async (req, res) => {
  try {
    await db.deleteTimecard(req.params.id, req.userToken);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting timecard:", error);
    res.status(500).json({ error: "Failed to delete timecard" });
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
    const profile = await db.updateStaffProfile(
      req.params.id,
      req.body,
      req.userToken
    );
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
    await db.deleteStaffProfile(req.params.id, req.userToken);
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
app.post("/vehicles", validateJWT, async (req, res) => {
  try {
    const vehicleData = {
      ...req.body,
      user_id: req.user.id,
    };
    const vehicle = await db.createVehicle(vehicleData, req.userToken);
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
    const vehicle = await db.updateVehicle(
      req.params.id,
      req.body,
      req.userToken
    );
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
    await db.deleteVehicle(req.params.id, req.userToken);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

// Organization routes
app.post("/organizations", validateJWT, async (req, res) => {
  try {
    const organization = await db.createOrganization(req.body, req.userToken);
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
    const organization = await db.updateOrganization(
      req.params.id,
      req.body,
      req.userToken
    );
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
    await db.deleteOrganization(req.params.id, req.userToken);
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

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;
