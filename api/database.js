const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_KEY must be set"
  );
}

// Create a function to get Supabase client with user context
function getSupabaseClient(userToken = null) {
  try {
    const client = createSupabaseClient(supabaseUrl, supabaseKey, {
      global: {
        headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
      },
    });
    return client;
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    throw error;
  }
}

// Default client for operations that don't need user context (like schema operations)
let supabase;
try {
  supabase = createSupabaseClient(supabaseUrl, supabaseKey);
} catch (error) {
  console.error("Failed to initialize Supabase client:", error);
  throw error;
}

async function handle(result) {
  try {
    const { data, error } = await result;
    if (error) {
      console.error("Supabase error:", error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data;
  } catch (err) {
    console.error("Database operation failed:", err);
    throw err;
  }
}
// Client CRUD operations
async function createClient(clientData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("clients").insert(clientData).select().single());
}

async function getAllClients(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("clients").select("*"));
}

async function getClientById(clientId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("clients").select("*").eq("client_id", clientId).single()
  );
}

async function updateClient(clientId, clientData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("clients")
      .update(clientData)
      .eq("client_id", clientId)
      .select()
      .single()
  );
}

async function deleteClient(clientId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("clients").delete().eq("client_id", clientId));
}

// Calls CRUD operations
async function createCall(callData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("calls").insert(callData).select().single());
}

async function getAllCalls(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("calls").select("*"));
}

async function getCallById(callId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("calls").select("*").eq("call_id", callId).single()
  );
}

async function updateCall(callId, callData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("calls")
      .update(callData)
      .eq("call_id", callId)
      .select()
      .single()
  );
}

async function deleteCall(callId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("calls").delete().eq("call_id", callId));
}

// Driver Unavailability CRUD operations
async function createDriverUnavailability(unavailabilityData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("driver_unavailability").insert(unavailabilityData)
  );
}
// Timecards CRUD operations
async function createTimecard(timecardData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("timecards").insert(timecardData).select().single()
  );
}

async function getAllDriverUnavailabilities(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("driver_unavailability"));
}

async function getAllTimecards(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("timecards")

      .select("*")
  );
}

async function getDriverUnavailabilityById(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("driver_unavailability").select("*").eq("id", id));
}

async function getDriverUnavailabilityByUId(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("driver_unavailability").select("*").eq("user_id", id)
  );
}
async function getTimecardById(timecardId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("timecards").select("*").eq("timecard_id", timecardId).single()
  );
}

async function updateDriverUnavailability(id, unavailabilityData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("driver_unavailability").update(unavailabilityData).eq("id", id)
  );
}
async function updateTimecard(timecardId, timecardData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("timecards")
      .update(timecardData)
      .eq("timecard_id", timecardId)
      .select()
      .single()
  );
}

async function createTimecard(timecardData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("timecards").insert(timecardData).select().single()
  );
}

async function getAllTimecards(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("timecards").select("*"));
}

async function getTimecardById(timecardId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("timecards").select("*").eq("timecard_id", timecardId).single()
  );
}

async function updateTimecard(timecardId, timecardData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("timecards")
      .update(timecardData)
      .eq("timecard_id", timecardId)
      .select()
      .single()
  );
}

async function deleteTimecard(timecardId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("timecards").delete().eq("timecard_id", timecardId)
  );
}

// Staff Profiles CRUD operations
async function createStaffProfile(profileData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("staff_profiles").insert(profileData).select().single()
  );
}

async function getAllStaffProfiles(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("staff_profiles").select("*"));
}

async function getStaffProfileById(userId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("staff_profiles").select("*").eq("user_id", userId).single()
  );
}

async function updateStaffProfile(userId, profileData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("staff_profiles")
      .update(profileData)
      .eq("user_id", userId)
      .select()
      .single()
  );
}

async function deleteStaffProfile(userId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("staff_profiles").delete().eq("user_id", userId));
}

// Transactions Audit Log operations
async function createTransactionAuditLog(logData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("transactions_audit_log").insert(logData).select().single()
  );
}

async function getAllTransactionAuditLogs(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("transactions_audit_log").select("*"));
}

async function getTransactionAuditLogById(transactionId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("transactions_audit_log")
      .select("*")
      .eq("transaction_id", transactionId)
      .single()
  );
}

// Vehicles CRUD operations
async function createVehicle(vehicleData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("vehicles").insert(vehicleData).select().single());
}

async function getAllVehicles(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("vehicles").select("*"));
}

async function getVehicleById(vehicleId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("vehicles").select("*").eq("vehicle_id", vehicleId).single()
  );
}

async function updateVehicle(vehicleId, vehicleData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("vehicles")
      .update(vehicleData)
      .eq("vehicle_id", vehicleId)
      .select()
      .single()
  );
}

async function deleteVehicle(vehicleId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("vehicles").delete().eq("vehicle_id", vehicleId));
}

// Organization CRUD operations
async function createOrganization(orgData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("organization").insert(orgData).select().single());
}

async function getAllOrganizations(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("organization").select("*"));
}

async function getOrganizationById(orgId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("organization").select("*").eq("org_id", orgId).single()
  );
}

async function updateOrganization(orgId, orgData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("organization")
      .update(orgData)
      .eq("org_id", orgId)
      .select()
      .single()
  );
}

async function deleteOrganization(orgId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("organization").delete().eq("org_id", orgId));
}

async function deleteDriverUnavailability(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from("driver_unavailability").delete().eq("id", id));
}

async function deleteTimecard(timecardId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client.from("timecards").delete().eq("timecard_id", timecardId)
  );
}
//initial api call made to load admin dashboard on driver table
async function getDriverForAdminDash(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("staff_profiles")
      .select(
        "first_name,last_name,role,email,dob,address,city,state,zipcode,primary_phone"
      )
      .contains("role", ["Driver"])
  );
}
//initial api call made to load admin dashboard on volunteer table
async function getVolunteerForAdminDash(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("staff_profiles")
      .select(
        "first_name,last_name,role,email,dob,address,city,state,zipcode,primary_phone"
      )
      .contains("role", ["Volunteer"])
  );
}
//initial api call made to load admin dashboard on client table
async function getClientForAdminDash(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("clients")
      .select(
        "first_name,last_name,date_of_birth,street_address,city,state,zip_code,primary_phone"
      )
  );
}
//initial api call made to load admin dashboard on volunteer table
async function getDispatcherForAdminDash(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("staff_profiles")
      .select(
        "first_name,last_name,role,email,dob,address,city,state,zipcode,primary_phone"
      )
      .contains("role", ["Dispatcher"])
  );
}
//audit log that perform inner join with staff profiles
async function getAuditLogTable(userToken) {
  try {
    const { data, error } = await supabase.from("transactions_audit_log")
      .select(`
        transaction_id,
        action_enum,
        table_name_enum,
        timestamp,
        field_name,
        old_value,
        new_value,
        staff_profiles(first_name, last_name)
      `);

    if (error) {
      return [error, null];
    }

    return [null, { data }];
  } catch (err) {
    return [err, null];
  }
}

//formatter for frontend to receive json
function formatAuditLogData(data) {
  if (Array.isArray(data)) {
    return data.map((item) => ({
      transaction_id: item.transaction_id,
      action: item.action_enum,
      table_name: item.table_name_enum,
      timestamp: item.timestamp,
      field_name: item.field_name,
      old_value: item.old_value,
      new_value: item.new_value,
      name: `${item.staff_profiles?.first_name || ""} ${
        item.staff_profiles?.last_name || ""
      }`.trim(),
    }));
  } else {
    return {
      transaction_id: data.transaction_id,
      action: data.action_enum,
      table_name: data.table_name_enum,
      timestamp: data.timestamp,
      field_name: data.field_name,
      old_value: data.old_value,
      new_value: data.new_value,
      name: `${data.staff_profiles?.first_name || ""} ${
        data.staff_profiles?.last_name || ""
      }`.trim(),
    };
  }
}

async function getCallTableForLog(userToken) {
  const client = getSupabaseClient(userToken);
  const data = await handle(
    client.from("calls").select(`
        call_time,
        call_type,
        other_type,
        phone_number,
        forwarded_to_name,
        forwarded_to_date,
        caller_first_name,
        caller_last_name,
        staff_profile:user_id (
          first_name,
          last_name
        )
      `)
  );
  if (data) {
    return data.map((call) => ({
      call_time: call.call_time,
      call_type: call.call_type,
      other_type: call.other_type,
      phone_number: call.phone_number,
      forwarded_to_name: call.forwarded_to_name,
      forwarded_to_date: call.forwarded_to_date,
      staff_name: call.staff_profile
        ? `${call.staff_profile.first_name} ${call.staff_profile.last_name}`.trim()
        : null,
      caller_name:
        call.caller_first_name || call.caller_last_name
          ? `${call.caller_first_name || ""} ${
              call.caller_last_name || ""
            }`.trim()
          : null,
    }));
  }

  return data;
}

async function deleteLogsByTimeRange(userToken, startTime, endTime) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("transactions_audit_log")
      .delete()
      .gte("timestamp", startTime)
      .lte("timestamp", endTime)
  );
}

async function previewLogsByTimeRange(userToken, startTime, endTime) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from("transactions_audit_log")
      .select(
        "transaction_id,staff_profiles:user_id(first_name, last_name),timestamp,field_name,old_value,new_value,action_enum,table_name_enum"
      )
      .gte("timestamp", startTime)
      .lte("timestamp", endTime)
  );
}
module.exports = {
  supabase,
  getSupabaseClient,
  handle,
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  createCall,
  getAllCalls,
  getCallById,
  updateCall,
  deleteCall,
  createDriverUnavailability,
  getAllDriverUnavailabilities,
  getDriverUnavailabilityById,
  updateDriverUnavailability,
  deleteDriverUnavailability,
  createTimecard,
  getAllTimecards,
  getTimecardById,
  updateTimecard,
  deleteTimecard,
  createStaffProfile,
  getAllStaffProfiles,
  getStaffProfileById,
  updateStaffProfile,
  deleteStaffProfile,
  createTransactionAuditLog,
  getAllTransactionAuditLogs,
  getTransactionAuditLogById,
  createVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  createOrganization,
  getAllOrganizations,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  getDriverForAdminDash,
  getClientForAdminDash,
  getVolunteerForAdminDash,
  deleteDriverUnavailability,
  getDispatcherForAdminDash,
  getAuditLogTable,
  formatAuditLogData,
  getCallTableForLog,
  deleteLogsByTimeRange,
  previewLogsByTimeRange,
  getDriverUnavailabilityByUId,
};
