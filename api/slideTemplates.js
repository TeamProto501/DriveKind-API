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


// ---- Slide Template Settings operations ----
async function getSlideTemplateSettings(userToken, userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  const client = getSupabaseClient(userToken);
  const result = await handle(
    client
      .from('slide_template_settings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  );
  console.log('Slide template settings retrieved:', result);
  if (!result || result.length === 0) {
    throw new Error('No slide template settings found for this user');
  }
  
  return result;
}

async function getSlideTemplateSettingById(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from('slide_template_settings')
      .select('*')
      .eq('id', id)
      .single()
  );
}

async function createSlideTemplateSetting(data, userToken, userId) {
  const client = getSupabaseClient(userToken);
  const settingData = { ...data, user_id: userId };
  return handle(
    client
      .from('slide_template_settings')
      .insert(settingData)
      .select('*')
      .single()
  );
}

async function updateSlideTemplateSetting(id, data, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from('slide_template_settings')
      .update(data)
      .eq('id', id)
      .select('*')
      .single()
  );
}

async function deleteSlideTemplateSetting(id, userToken) {
  const client = getSupabaseClient(userToken);
  await handle(client.from('slide_template_settings').delete().eq('id', id));
}

// ---- User-specific template settings ----
async function getSlideTemplateSettingsByUser(userId, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from('slide_template_settings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  );
}

module.exports = {
  getSlideTemplateSettings,
  getSlideTemplateSettingById,
  createSlideTemplateSetting,
  updateSlideTemplateSetting,
  deleteSlideTemplateSetting,
  getSlideTemplateSettingsByUser
};