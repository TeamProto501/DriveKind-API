const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_KEY must be set');
}

// Create a function to get Supabase client with user context
function getSupabaseClient(userToken = null) {
  try {
    const client = createSupabaseClient(supabaseUrl, supabaseKey, {
      global: {
        headers: userToken ? { Authorization: `Bearer ${userToken}` } : {}
      }
    });
    return client;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    throw error;
  }
}

// Default client for operations that don't need user context (like schema operations)
let supabase;
try {
  supabase = createSupabaseClient(supabaseUrl, supabaseKey);
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  throw error;
}

async function handle(result) {
  try {
    const { data, error } = await result;
    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data;
  } catch (err) {
    console.error('Database operation failed:', err);
    throw err;
  }
}
// Client CRUD operations
async function createClient(clientData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('clients')
    .insert(clientData)
    .select()
    .single()
  );
}

async function getAllClients(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('clients')
    .select('*')
  );
}

async function getClientById(clientId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('clients')
    .select('*')
    .eq('client_id', clientId)
    .single()
  );
}

async function updateClient(clientId, clientData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('clients')
    .update(clientData)
    .eq('client_id', clientId)
    .select()
    .single()
  );
}

async function deleteClient(clientId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('clients')
    .delete()
    .eq('client_id', clientId)
  );
}

// Calls CRUD operations
async function createCall(callData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('calls')
    .insert(callData)
    .select()
    .single()
  );
}

async function getAllCalls(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('calls')
    .select('*')
  );
}

async function getCallById(callId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('calls')
    .select('*')
    .eq('call_id', callId)
    .single()
  );
}

async function updateCall(callId, callData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('calls')
    .update(callData)
    .eq('call_id', callId)
    .select()
    .single()
  );
}

async function deleteCall(callId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('calls')
    .delete()
    .eq('call_id', callId)
  );
}

// Driver Unavailability CRUD operations
async function createDriverUnavailability(unavailabilityData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('driver_unavailability')
    .insert(unavailabilityData)
    .select()
    .single()
  );
}

async function getAllDriverUnavailabilities(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('driver_unavailability')
    .select('*')
  );
}

async function getDriverUnavailabilityById(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('driver_unavailability')
    .select('*')
    .eq('id', id)
    .single()
  );
}

async function updateDriverUnavailability(id, unavailabilityData, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('driver_unavailability')
    .update(unavailabilityData)
    .eq('id', id)
    .select()
    .single()
  );
}

async function deleteDriverUnavailability(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client
    .from('driver_unavailability')
    .delete()
    .eq('id', id)
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
  deleteCall
  deleteCall,
  createDriverUnavailability,
  getAllDriverUnavailabilities,
  getDriverUnavailabilityById,
  updateDriverUnavailability,
  deleteDriverUnavailability
};