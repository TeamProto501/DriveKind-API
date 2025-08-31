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

// ---- Client operations ----
async function getClients(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('clients').select('*'));
}

async function getClientById(id, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('clients').select('*').eq('clientid', id).single());
}

async function showSchema() {
  return handle(supabase.from('clients').select('*'));
}

async function createClientRecord(data, userToken, orgId) {
  const client = getSupabaseClient(userToken);
  const clientData = { ...data, org_id: orgId };
  return handle(
    client
      .from('clients')
      .insert(clientData)
      .select()
      .single()
  );
}

async function updateClient(id, data, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from('clients')
      .update(data)
      .eq('clientid', id)
      .select()
      .single()
  );
}

async function deleteClient(id, userToken) {
  const client = getSupabaseClient(userToken);
  await handle(client.from('clients').delete().eq('clientid', id));
}

// ---- Provider operations ----
async function getProviders(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('providers').select('*'));
}

async function createProvider(data, userToken, orgId) {
  const client = getSupabaseClient(userToken);
  const providerData = { ...data, org_id: orgId };
  return handle(
    client
      .from('providers')
      .insert(providerData)
      .select()
      .single()
  );
}

async function updateProvider(id, data, userToken) {
  const client = getSupabaseClient(userToken);
  return handle(
    client
      .from('providers')
      .update(data)
      .eq('providerid', id)
      .select()
      .single()
  );
}

async function deleteProvider(id, userToken) {
  const client = getSupabaseClient(userToken);
  await handle(client.from('providers').delete().eq('providerid', id));
}

// ---- Billable operations ----
async function getBillables(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('billables').select('*').range(0, 99999));
}

async function getDisplayedBillables(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('billables').select('id, billable_code, description, cost').eq('is_displayed', true));
}


async function getActiveBillables(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('billables').select('id, billable_code, description, cost').eq('is_active', true));
}

async function getBillableById(id, userToken) {
  const client = getSupabaseClient(userToken);
  // Check if id is numeric (new PK) or string (old billable_code for backward compatibility)
  const isNumeric = !isNaN(id) && !isNaN(parseFloat(id));
  const field = isNumeric ? 'id' : 'billable_code';
  const value = isNumeric ? parseInt(id) : id;
  
  return handle(client.from('billables').select('*').eq(field, value).single());
}

async function getBillableByCode(code, userToken) {
  const client = getSupabaseClient(userToken);
  console.log(`Looking up billable by code: ${code}`);
  
  try {
    const { data, error } = await client
      .from('billables')
      .select('*')
      .eq('billable_code', code)
      .maybeSingle(); // Use maybeSingle to avoid error if no rows found
    
    if (error) {
      console.error('Error finding billable by code:', error);
      throw new Error(`Database error finding billable: ${error.message}`);
    }
    
    if (!data) {
      console.log(`No billable found with code: ${code}`);
      return null;
    }
    
    console.log(`Found billable:`, data);
    return data;
  } catch (error) {
    console.error('getBillableByCode failed:', error);
    throw error;
  }
}

async function createBillable(data, userToken, orgId) {
  const client = getSupabaseClient(userToken);
  const billableData = { ...data, org_id: orgId };
  console.log('Creating billable:', billableData.billable_code);
  // Check if billable_code already exists for this organization
  if (billableData.billable_code) {
    const existing = await handle(
      client
        .from('billables')
        .select('id, billable_code')
        .eq('billable_code', billableData.billable_code)
        .eq('org_id', orgId)
        .maybeSingle()
    );
    
    if (existing) {
      throw new Error(`Billable code '${billableData.billable_code}' already exists for this organization`);
    }
  }
  
  return handle(
    client
      .from('billables')
      .insert(billableData)
      .select()
      .maybeSingle()
  );
}

async function updateBillable(identifier, data, userToken) {
  const client = getSupabaseClient(userToken);
  console.log(`Updating billable with identifier: ${identifier}`);
  console.log('Update data:', data);
  // Improved identifier type detection
  const isNumeric = typeof identifier === 'number' || 
    (typeof identifier === 'string' && /^\d+$/.test(identifier) && !isNaN(parseInt(identifier)));
  const field = isNumeric ? 'id' : 'billable_code';
  const value = isNumeric ? parseInt(identifier) : identifier;
  
  console.log(`Updating billable: identifier=${identifier}, field=${field}, value=${value}, data=`, data);
  
  try {
    // First check if the billable exists
    const { data: existing, error: findError } = await client
      .from('billables')
      .select('id, billable_code')
      .eq("id", identifier)
      .limit(1)
      .maybeSingle();
    if (findError) {
      console.error('Error finding billable:', findError);
      throw new Error(`Database error finding billable: ${findError.message}`);
    }
    
    if (!existing) {
      console.error(`Billable not found with ${field}=${value}`);
      throw new Error(`Billable not found with ${field}: ${value}`);
    }
    console.log('Existing billable found:', data);
    // Now perform the update
    const { data: updated, error: updateError } = await client
       .from('billables')
      .update(data)
      .eq("id", identifier)
      .select('id, billable_code')
      .maybeSingle();
    
    if (updateError) {
      console.error('Error updating billable:', updateError);
      throw new Error(`Database error updating billable: ${updateError.message}`);
    }
    
    console.log('Billable updated successfully:', updated);
    return updated;
  } catch (error) {
    console.error('updateBillable failed:', error);
    throw error;
  }
}

async function deleteBillable(identifier, userToken) {
  const client = getSupabaseClient(userToken);
  // Check if identifier is numeric (new PK) or string (old billable_code for backward compatibility)
  const isNumeric = !isNaN(identifier) && !isNaN(parseFloat(identifier));
  const field = isNumeric ? 'id' : 'billable_code';
  const value = isNumeric ? parseInt(identifier) : identifier;
  
  await handle(client.from('billables').delete().eq(field, value));
}

// ---- Visit operations (now using treatment_plans table for backward compatibility) ----

async function getVisits(userToken) {
  const client = getSupabaseClient(userToken);
  // Get treatment plans and format them as visits for backward compatibility
  // Using LEFT JOIN for profiles to handle cases where created_by might not exist or be null
  // Specify the exact relationship to avoid ambiguity between created_by and presenter_id FKs
  const treatmentPlans = await handle(
    client
      .from('treatment_plans')
      .select(`
        *,
        created_by_profile:profiles!treatment_plans_created_by_fkey(
          auth_user_id,
          first_name,
          last_name
        ),
        options:treatment_plan_options(
          *,
          items:treatment_items(*)
        )
      `)
  );
  
  // Convert treatment plans to visit format for backward compatibility
  const visits = treatmentPlans.map(plan => {
    // Sort nested arrays by sequence_order
    if (plan.options) {
      plan.options.sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
      plan.options.forEach(option => {
        if (option.items) {
          option.items.sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
        }
      });
    }
    
    return {
      visitid: plan.id, // Map treatment plan id to visitid
      clientid: plan.clientid,
      providerid: plan.providerid,
      visitdate: plan.created_at, // Use created_at as visitdate
      paid: convertPaymentStatusToPaid(plan.payment_status), // Convert for backward compatibility
      notes: plan.notes,
      treatment_plan: plan, // Include full treatment plan data
      // Additional fields for full backward compatibility
      org_id: plan.org_id,
      created_at: plan.created_at,
      updated_at: plan.updated_at
    };
  });
  
  return visits;
}


async function getVisitById(id, userToken) {
  const client = getSupabaseClient(userToken);
  // Get treatment plan by id and format as visit for backward compatibility
  const treatmentPlan = await getTreatmentPlanById(id, userToken);
  
  if (!treatmentPlan) {
    return null;
  }
  
  // Convert treatment plan to visit format
  const visit = {
    visitid: treatmentPlan.id,
    clientid: treatmentPlan.clientid,
    providerid: treatmentPlan.providerid,
    visitdate: treatmentPlan.created_at,
    paid: convertPaymentStatusToPaid(treatmentPlan.payment_status),
    notes: treatmentPlan.notes,
    treatment_plan: treatmentPlan,
    org_id: treatmentPlan.org_id,
    created_at: treatmentPlan.created_at,
    updated_at: treatmentPlan.updated_at,
    // Note: visitdetails and visitimages are no longer available since visits table is gone
    // The treatment plan data includes options and items instead
    visitdetails: [], // Empty array for backward compatibility
    visitimages: [] // Empty array for backward compatibility
  };

  return visit;
}

async function getImageById(id) {
  return handle(
    supabase
      .from('visitimages')
      .select('imageid, imagename, imagetype, imagedata')
      .eq('imageid', id)
      .single()
  );
}

async function createVisit(data, userToken, orgId, createdBy = null) {
  const client = getSupabaseClient(userToken);
  const { clientid, providerid, visitdate, paid, notes, details = [], images = [], treatment_plan, ...otherData } = data;
  console.log('Creating visit (using treatment_plans):', data);

  // Convert visit data to treatment plan format
  const treatmentPlanData = {
    clientid,
    providerid,
    paid, // Will be converted to payment_status in createTreatmentPlan
    notes,
    patient_name: otherData.patient_name || '', // Default if not provided
    doctor_name: otherData.doctor_name || '', // Default if not provided
    ...otherData, // Include any additional fields
    ...(treatment_plan || {}) // Merge with any explicit treatment plan data
  };

  // If details are provided, convert them to treatment plan options/items
  if (details && details.length > 0) {
    if (!treatmentPlanData.options) {
      treatmentPlanData.options = [];
    }
    
    // Convert details to treatment plan items
    const detailsOption = {
      name: 'Visit Details',
      sequence_order: 1,
      items: details.map((detail, index) => ({
        name: detail.name || `Detail ${index + 1}`,
        quantity: detail.quantity || 1,
        cost: detail.cost || 0,
        teeth: detail.teeth || '',
        sequence_order: index + 1
      }))
    };
    treatmentPlanData.options.push(detailsOption);
  }

  // If images are provided, add them to treatment plan images
  if (images && images.length > 0) {
    treatmentPlanData.images = images.map((img, index) => ({
      image_name: img.name || img.imagename,
      image_type: img.type || img.imagetype,
      image_data: img.data || img.imagedata,
      mime_type: img.type || img.imagetype || 'image/jpeg',
      sequence_order: index + 1
    }));
  }

  // Create treatment plan instead of visit
  const createdTreatmentPlan = await createTreatmentPlan(treatmentPlanData, userToken, orgId, createdBy);
  
  // Return in visit format for backward compatibility
  return getVisitById(createdTreatmentPlan.id, userToken);
}

async function updateVisit(id, data, userToken) {
  const client = getSupabaseClient(userToken);
  // Convert visit update data to treatment plan update format
  const { visitdate, details, images, ...updateData } = data;
  
  // Update the treatment plan with visit-compatible fields
  const updatedTreatmentPlan = await updateTreatmentPlan(id, updateData, userToken);
  
  // Return in visit format for backward compatibility
  return getVisitById(id, userToken);
}

async function deleteVisit(id, userToken) {
  // Delete the treatment plan instead of visit (since visits table no longer exists)
  await deleteTreatmentPlan(id, userToken);
}

// ---- Payment Status Conversion and Validation Utilities ----
const VALID_PAYMENT_STATUSES = ['financed', 'paid_in_full', 'unpaid'];

function validatePaymentStatus(paymentStatus) {
  if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new Error(`Invalid payment_status: ${paymentStatus}. Must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`);
  }
}

function convertPaymentStatusToPaid(paymentStatus) {
  return paymentStatus === 'paid_in_full';
}

function convertPaidToPaymentStatus(paid) {
  return paid ? 'paid_in_full' : 'unpaid';
}

function addPaidFieldToTreatmentPlan(treatmentPlan) {
  if (treatmentPlan && treatmentPlan.payment_status !== undefined) {
    return {
      ...treatmentPlan,
      paid: convertPaymentStatusToPaid(treatmentPlan.payment_status)
    };
  }
  return treatmentPlan;
}

// ---- Treatment Plan operations ----
async function createTreatmentPlan(data, userToken, orgId, createdBy = null) {
  const client = getSupabaseClient(userToken);
  const { 
    patient_name, 
    doctor_name, 
    discount = 0, 
    insurance_coverage = 0, 
    courtesy_amount = 0, 
    clientid,
    providerid,
    payment_status = 'unpaid',
    notes,
    paid, // For backward compatibility
    options = [], 
    images = [] 
  } = data;
  
  // Convert old 'paid' boolean to new payment_status enum for backward compatibility
  let finalPaymentStatus = payment_status;
  if (paid !== undefined && !payment_status) {
    finalPaymentStatus = paid ? 'paid_in_full' : 'unpaid';
  }
  
  // Validate payment status
  validatePaymentStatus(finalPaymentStatus);
  
  const treatmentPlan = await handle(
    client
      .from('treatment_plans')
      .insert({ 
        patient_name, 
        doctor_name, 
        discount, 
        insurance_coverage, 
        courtesy_amount, 
        clientid,
        providerid,
        payment_status: finalPaymentStatus,
        notes,
        org_id: orgId, 
        created_by: createdBy 
      })
      .select()
      .single()
  );
  
  const planId = treatmentPlan.id;
  
  for (const option of options) {
    const planOption = await handle(
      client
        .from('treatment_plan_options')
        .insert({ 
          treatment_plan_id: planId, 
          name: option.name, 
          sequence_order: option.sequence_order || 1 
        })
        .select()
        .single()
    );
    
    if (option.items && option.items.length > 0) {
      for (const item of option.items) {
        await handle(
          client
            .from('treatment_items')
            .insert({
              plan_option_id: planOption.id,
              name: item.name,
              quantity: item.quantity || 1,
              cost: item.cost,
              teeth: item.teeth,
              sequence_order: item.sequence_order || 1
            })
        );
      }
    }
  }
  
  for (const img of images) {
    await handle(
      client
        .from('treatment_plan_images')
        .insert({
          treatment_plan_id: planId,
          image_type: img.image_type,
          image_data: img.image_data,
          image_name: img.image_name,
          mime_type: img.mime_type,
          sequence_order: img.sequence_order || 1,
          file_size: img.file_size
        })
    );
  }
  
  return getTreatmentPlanById(planId, userToken);
}

async function getTreatmentPlanById(id, userToken, includeImages = true) {
  const client = getSupabaseClient(userToken);
  const plan = await handle(
    client.from('treatment_plans').select('*').eq('id', id).single()
  );
  
  const options = await handle(
    client.from('treatment_plan_options').select('*').eq('treatment_plan_id', id).order('sequence_order')
  );
  
  for (const option of options) {
    option.items = await handle(
      client.from('treatment_items').select('*').eq('plan_option_id', option.id).order('sequence_order')
    );
  }
  
  const result = {
    ...plan,
    options
  };
  
  if (includeImages) {
    const images = await handle(
      client.from('treatment_plan_images').select('*').eq('treatment_plan_id', id).order('sequence_order')
    );
    result.images = images;
  }
  
  return result;
}

// ---- User operations ----
// Note: User management is now handled by Supabase Auth
// Custom user table operations removed - use Supabase auth methods instead

async function getTreatmentPlans(userToken) {
  const client = getSupabaseClient(userToken);
  return handle(client.from('treatment_plans').select('*'));
}

async function getTreatmentPlansWithCosts(userToken) {
  const client = getSupabaseClient(userToken);
  
  // Get all treatment plans with their options and calculated costs in one query
  // Using LEFT JOIN for profiles to handle cases where presenter_id might not exist or be null
  // Specify the exact relationship to avoid ambiguity between created_by and presenter_id FKs
  const { data: planOptionsData, error } = await client
    .from('treatment_plans')
    .select(`
      *,
      presenter_profile:profiles!treatment_plans_presenter_id_fkey(
        auth_user_id,
        first_name,
        last_name
      ),
      treatment_plan_options (
        id,
        name,
        sequence_order,
        treatment_items (
          cost,
          quantity
        )
      )
    `)
    .order('id')
    .order('sequence_order', { referencedTable: 'treatment_plan_options' });

  if (error) {
    throw error;
  }

  // Process the nested data to calculate total costs for each option
  const processedPlans = planOptionsData.map(plan => {
    const options = plan.treatment_plan_options.map(option => {
      const totalCost = option.treatment_items.reduce((sum, item) => {
        return sum + (parseFloat(item.cost || 0) * parseInt(item.quantity || 1));
      }, 0);
      
      return {
        id: option.id,
        option_name: option.name,
        sequence_order: option.sequence_order,
        total_cost: totalCost
      };
    });

    // Return all treatment plan fields except org_id and the nested structure
    const { treatment_plan_options, org_id, ...planData } = plan;
    
    return {
      ...planData,
      options // Add processed options with costs
    };
  });

  return processedPlans;
}

async function getTreatmentPlansByCreator(creatorId, userToken, startDate = null, endDate = null) {
  const client = getSupabaseClient(userToken);
  
  // Build the query with optional date filtering
  let query = client
    .from('treatment_plans')
    .select(`
      *,
      created_by_profile:profiles!treatment_plans_created_by_fkey(
        auth_user_id,
        first_name,
        last_name
      ),
      treatment_plan_options (
        id,
        name,
        sequence_order,
        treatment_items (
          cost,
          quantity
        )
      )
    `)
    .eq('created_by', creatorId);

  // Apply date filtering if dates are provided
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  
  if (endDate) {
    // Add one day to endDate to include the full end date (up to 23:59:59)
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    query = query.lt('created_at', endDatePlusOne.toISOString().split('T')[0]);
  } else if (startDate && !endDate) {
    // If start date is provided but no end date, filter up to today
    const today = new Date();
    today.setDate(today.getDate() + 1); // Include today
    query = query.lt('created_at', today.toISOString().split('T')[0]);
  }

  const { data: planOptionsData, error } = await query
    .order('id')
    .order('sequence_order', { referencedTable: 'treatment_plan_options' });

  if (error) {
    throw error;
  }

  // Process the nested data to calculate total costs for each option
  const processedPlans = planOptionsData.map(plan => {
    const options = plan.treatment_plan_options.map(option => {
      const totalCost = option.treatment_items.reduce((sum, item) => {
        return sum + (parseFloat(item.cost || 0) * parseInt(item.quantity || 1));
      }, 0);
      
      return {
        id: option.id,
        option_name: option.name,
        sequence_order: option.sequence_order,
        total_cost: totalCost
      };
    });

    // Return all treatment plan fields except org_id and the nested structure
    const { treatment_plan_options, org_id, ...planData } = plan;
    
    return {
      ...planData,
      options // Add processed options with costs
    };
  });

  return processedPlans;
}

async function getTreatmentPlansByPresenter(presenterId, userToken, startDate = null, endDate = null) {
  const client = getSupabaseClient(userToken);
  
  // Build the query with optional date filtering
  let query = client
    .from('treatment_plans')
    .select(`
      *,
      created_by_profile:profiles!treatment_plans_created_by_fkey(
        auth_user_id,
        first_name,
        last_name
      ),
      treatment_plan_options (
        id,
        name,
        sequence_order,
        treatment_items (
          cost,
          quantity
        )
      )
    `)
    .eq('presenter_id', presenterId);

  // Apply date filtering if dates are provided
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  
  if (endDate) {
    // Add one day to endDate to include the full end date (up to 23:59:59)
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    query = query.lt('created_at', endDatePlusOne.toISOString().split('T')[0]);
  } else if (startDate && !endDate) {
    // If start date is provided but no end date, filter up to today
    const today = new Date();
    today.setDate(today.getDate() + 1); // Include today
    query = query.lt('created_at', today.toISOString().split('T')[0]);
  }

  const { data: planOptionsData, error } = await query
    .order('id')
    .order('sequence_order', { referencedTable: 'treatment_plan_options' });

  if (error) {
    throw error;
  }

  // Process the nested data to calculate total costs for each option
  const processedPlans = planOptionsData.map(plan => {
    const options = plan.treatment_plan_options.map(option => {
      const totalCost = option.treatment_items.reduce((sum, item) => {
        return sum + (parseFloat(item.cost || 0) * parseInt(item.quantity || 1));
      }, 0);
      
      return {
        id: option.id,
        option_name: option.name,
        sequence_order: option.sequence_order,
        total_cost: totalCost
      };
    });

    // Return all treatment plan fields except org_id and the nested structure
    const { treatment_plan_options, org_id, ...planData } = plan;
    
    return {
      ...planData,
      options // Add processed options with costs
    };
  });

  return processedPlans;
}

async function getUniquePresenters(userToken) {
  const client = getSupabaseClient(userToken);
  
  try {
    // Get distinct presenter_ids from treatment_plans and join with profiles
    const { data, error } = await client
      .from('treatment_plans')
      .select(`
        presenter_id,
        presenter_profile:profiles!treatment_plans_presenter_id_fkey(
          auth_user_id,
          first_name,
          last_name
        )
      `)
      .not('presenter_id', 'is', null)
      .order('presenter_profile(first_name)', { nullsLast: true })
      .order('presenter_profile(last_name)', { nullsLast: true });

    if (error) {
      throw error;
    }

    // Process to get unique presenters
    const uniquePresenters = new Map();
    
    if (data) {
      data.forEach(item => {
        if (item.presenter_id && item.presenter_profile) {
          if (!uniquePresenters.has(item.presenter_id)) {
            uniquePresenters.set(item.presenter_id, {
              auth_user_id: item.presenter_profile.auth_user_id,
              first_name: item.presenter_profile.first_name,
              last_name: item.presenter_profile.last_name
            });
          }
        }
      });
    }

    return Array.from(uniquePresenters.values());
  } catch (error) {
    console.error('Error getting unique presenters:', error);
    throw error;
  }
}

async function getAllProfiles(userToken) {
  const client = getSupabaseClient(userToken);
  
  try {
    // Get all profiles in the user's organization
    const { data, error } = await client
      .from('profiles')
      .select(`
        auth_user_id,
        first_name,
        last_name
      `)
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching all profiles:', error);
    throw error;
  }
}

async function getUniqueCreators(userToken) {
  const client = getSupabaseClient(userToken);
  
  try {
    // Get distinct created_by from treatment_plans and join with profiles
    const { data, error } = await client
      .from('treatment_plans')
      .select(`
        created_by,
        created_by_profile:profiles!treatment_plans_created_by_fkey(
          auth_user_id,
          first_name,
          last_name
        )
      `)
      .not('created_by', 'is', null)
      .order('created_by_profile(first_name)', { nullsLast: true })
      .order('created_by_profile(last_name)', { nullsLast: true });

    if (error) {
      throw error;
    }

    // Process to get unique creators
    const uniqueCreators = new Map();
    
    if (data) {
      data.forEach(item => {
        if (item.created_by && item.created_by_profile) {
          if (!uniqueCreators.has(item.created_by)) {
            uniqueCreators.set(item.created_by, {
              auth_user_id: item.created_by_profile.auth_user_id,
              first_name: item.created_by_profile.first_name,
              last_name: item.created_by_profile.last_name
            });
          }
        }
      });
    }

    return Array.from(uniqueCreators.values());
  } catch (error) {
    console.error('Error getting unique creators:', error);
    throw error;
  }
}

async function getTreatmentPlansByProvider(providerId, userToken, startDate = null, endDate = null) {
  const client = getSupabaseClient(userToken);
  
  // Build the query with optional date filtering
  let query = client
    .from('treatment_plans')
    .select(`
      *,
      created_by_profile:profiles!treatment_plans_created_by_fkey(
        auth_user_id,
        first_name,
        last_name
      ),
      treatment_plan_options (
        id,
        name,
        sequence_order,
        treatment_items (
          cost,
          quantity
        )
      )
    `)
    .eq('providerid', providerId);

  // Apply date filtering if dates are provided
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  
  if (endDate) {
    // Add one day to endDate to include the full end date (up to 23:59:59)
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
    query = query.lt('created_at', endDatePlusOne.toISOString().split('T')[0]);
  } else if (startDate && !endDate) {
    // If start date is provided but no end date, filter up to today
    const today = new Date();
    today.setDate(today.getDate() + 1); // Include today
    query = query.lt('created_at', today.toISOString().split('T')[0]);
  }

  const { data: planOptionsData, error } = await query
    .order('id')
    .order('sequence_order', { referencedTable: 'treatment_plan_options' });

  if (error) {
    throw error;
  }

  // Process the nested data to calculate total costs for each option
  const processedPlans = planOptionsData.map(plan => {
    const options = plan.treatment_plan_options.map(option => {
      const totalCost = option.treatment_items.reduce((sum, item) => {
        return sum + (parseFloat(item.cost || 0) * parseInt(item.quantity || 1));
      }, 0);
      
      return {
        id: option.id,
        option_name: option.name,
        sequence_order: option.sequence_order,
        total_cost: totalCost
      };
    });

    // Return all treatment plan fields except org_id and the nested structure
    const { treatment_plan_options, org_id, ...planData } = plan;
    
    return {
      ...planData,
      options // Add processed options with costs
    };
  });

  return processedPlans;
}

async function updateTreatmentPlan(id, data, userToken) {
  const client = getSupabaseClient(userToken);
  const { 
    patient_name, 
    doctor_name, 
    discount, 
    insurance_coverage, 
    courtesy_amount, 
    clientid,
    providerid,
    payment_status,
    notes,
    paid, // For backward compatibility
    options, 
    images, 
    ...planData 
  } = data;
  
  // Convert old 'paid' boolean to new payment_status enum for backward compatibility
  let finalPaymentStatus = payment_status;
  if (paid !== undefined && payment_status === undefined) {
    finalPaymentStatus = paid ? 'paid_in_full' : 'unpaid';
  }
  
  // Validate payment status if provided
  if (finalPaymentStatus !== undefined) {
    validatePaymentStatus(finalPaymentStatus);
  }
  
  // Build update object with only defined values
  const updateData = {};
  if (patient_name !== undefined) updateData.patient_name = patient_name;
  if (doctor_name !== undefined) updateData.doctor_name = doctor_name;
  if (discount !== undefined) updateData.discount = discount;
  if (insurance_coverage !== undefined) updateData.insurance_coverage = insurance_coverage;
  if (courtesy_amount !== undefined) updateData.courtesy_amount = courtesy_amount;
  if (clientid !== undefined) updateData.clientid = clientid;
  if (providerid !== undefined) updateData.providerid = providerid;
  if (finalPaymentStatus !== undefined) updateData.payment_status = finalPaymentStatus;
  if (notes !== undefined) updateData.notes = notes;
  
  // First update the main treatment plan
  const updatedPlan = await handle(
    client
      .from('treatment_plans')
      .update({ ...updateData, ...planData })
      .eq('id', id)
      .select()
      .single()
  );
  
  // If options are provided, replace all existing options
  if (options !== undefined) {
    // Delete existing options and their items
    const existingOptions = await handle(
      client.from('treatment_plan_options').select('id').eq('treatment_plan_id', id)
    );
    
    if (existingOptions && existingOptions.length > 0) {
      const optionIds = existingOptions.map(opt => opt.id);
      await handle(client.from('treatment_items').delete().in('plan_option_id', optionIds));
      await handle(client.from('treatment_plan_options').delete().eq('treatment_plan_id', id));
    }
    
    // Insert new options
    for (const option of options) {
      const planOption = await handle(
        client
          .from('treatment_plan_options')
          .insert({ 
            treatment_plan_id: id, 
            name: option.name, 
            sequence_order: option.sequence_order || 1 
          })
          .select()
          .single()
      );
      
      if (option.items && option.items.length > 0) {
        for (const item of option.items) {
          await handle(
            client
              .from('treatment_items')
              .insert({
                plan_option_id: planOption.id,
                name: item.name,
                quantity: item.quantity || 1,
                cost: item.cost,
                teeth: item.teeth,
                sequence_order: item.sequence_order || 1
              })
          );
        }
      }
    }
  }
  
  // If images are provided, replace all existing images
  if (images !== undefined) {
    // Delete existing images
    await handle(client.from('treatment_plan_images').delete().eq('treatment_plan_id', id));
    
    // Insert new images
    for (const img of images) {
      await handle(
        client
          .from('treatment_plan_images')
          .insert({
            treatment_plan_id: id,
            image_data: img.image_data,
            image_type: img.image_type || 'image/jpeg',
            description: img.description || '',
            sequence_order: img.sequence_order || 1
          })
      );
    }
  }
  
  return updatedPlan;
}

async function deleteTreatmentPlan(id, userToken) {
  const client = getSupabaseClient(userToken);
  // Delete the treatment plan - cascade will handle related records
  await handle(client.from('treatment_plans').delete().eq('id', id));
}

// ---- Quick Plan operations ----
async function getQuickPlans(userToken) {
  const client = getSupabaseClient(userToken);
  
  // First query: Get all quick plans
  const quickPlans = await handle(
    client
      .from('quick_plans')
      .select('*')
      .order('created_at', { ascending: false })
  );
  
  // Second query: Get all quick plan billables with billable details
  const quickPlanBillables = await handle(
    client
      .from('quick_plan_billables')
      .select(`
        quick_plan_id,
        billable_id,
        billables (
          id,
          billable_code,
          description,
          cost
        )
      `)
  );
  console.log('Quick Plan Billables:', quickPlanBillables);
  // Combine the data
  return quickPlans.map(plan => ({
    ...plan,
    billables: quickPlanBillables
      .filter(qpb => qpb.quick_plan_id === plan.id)
      .map(qpb => qpb.billables)
      .filter(Boolean) // Remove any null billables
  }));
}

async function getQuickPlanById(id, userToken) {
  const client = getSupabaseClient(userToken);
  const quickPlan = await handle(
    client
      .from('quick_plans')
      .select(`
        *,
        billables:quick_plan_billables(
          billable_id,
          billable:billables(
            id,
            billable_code,
            description,
            cost
          )
        )
      `)
      .eq('id', id)
      .single()
  );
  
  // Flatten the billables structure for easier consumption
  return {
    ...quickPlan,
    billables: quickPlan.billables.map(qpb => qpb.billable)
  };
}

async function createQuickPlan(data, userToken, orgId) {
  const client = getSupabaseClient(userToken);
  const { name, billable_ids = [], billable_codes = [] } = data;
  
  // Create the quick plan
  const quickPlan = await handle(
    client
      .from('quick_plans')
      .insert({ 
        name,
        org_id: orgId
      })
      .select()
      .single()
  );
  
  // Add billables to the quick plan if provided
  let allBillableIds = [...billable_ids];
  
  // Convert billable codes to IDs
  if (billable_codes.length > 0) {
    for (const code of billable_codes) {
      const billable = await handle(
        client.from('billables').select('id').eq('billable_code', code).single()
      );
      if (billable) {
        allBillableIds.push(billable.id);
      }
    }
  }
  
  if (allBillableIds.length > 0) {
    const quickPlanBillables = allBillableIds.map(billableId => ({
      quick_plan_id: quickPlan.id,
      billable_id: billableId
    }));
    
    await handle(
      client
        .from('quick_plan_billables')
        .insert(quickPlanBillables)
    );
  }
  
  // Return the full quick plan with billables
  return getQuickPlanById(quickPlan.id, userToken);
}

async function updateQuickPlan(id, data, userToken) {
  const client = getSupabaseClient(userToken);
  const { name, billable_ids, billable_codes } = data;
  
  // Update the quick plan name if provided
  if (name !== undefined) {
    await handle(
      client
        .from('quick_plans')
        .update({ name })
        .eq('id', id)
    );
  }
  
  // Update billables if provided
  if (billable_ids !== undefined || billable_codes !== undefined) {
    // Remove existing billable associations
    await handle(
      client
        .from('quick_plan_billables')
        .delete()
        .eq('quick_plan_id', id)
    );
    
    // Collect all billable IDs
    let allBillableIds = billable_ids ? [...billable_ids] : [];
    
    // Convert billable codes to IDs
    if (billable_codes && billable_codes.length > 0) {
      for (const code of billable_codes) {
        const billable = await handle(
          client.from('billables').select('id').eq('billable_code', code).single()
        );
        if (billable) {
          allBillableIds.push(billable.id);
        }
      }
    }
    
    // Add new billable associations
    if (allBillableIds.length > 0) {
      const quickPlanBillables = allBillableIds.map(billableId => ({
        quick_plan_id: id,
        billable_id: billableId
      }));
      
      await handle(
        client
          .from('quick_plan_billables')
          .insert(quickPlanBillables)
      );
    }
  }
  
  // Return the updated quick plan
  return getQuickPlanById(id, userToken);
}

async function deleteQuickPlan(id, userToken) {
  const client = getSupabaseClient(userToken);
  // Delete the quick plan - cascade should handle related records
  await handle(client.from('quick_plans').delete().eq('id', id));
}

// Public Treatment Links Functions
async function createPublicTreatmentLink(treatmentPlanId, userToken, orgId, orgName, orgCode) {
  const client = getSupabaseClient(userToken);
  
  // First verify the treatment plan belongs to the user's organization
  const treatmentPlan = await handle(
    client
      .from('treatment_plans')
      .select('id, org_id')
      .eq('id', treatmentPlanId)
      .eq('org_id', orgId)
      .single()
  );
  
  if (!treatmentPlan) {
    throw new Error('Treatment plan not found or access denied');
  }
  
  // Create the public link
  const publicLink = await handle(
    client
      .from('public_treatment_links')
      .insert({
        treatment_plan_id: treatmentPlanId,
        org_id: orgId,
        org_name: orgName,
        org_code: orgCode,
        created_by: (await client.auth.getUser()).data.user?.id
      })
      .select()
      .single()
  );
  
  return publicLink;
}

async function getPublicTreatmentPlan(uuid) {
  // Use service role client to bypass RLS for public access
  const serviceClient = createSupabaseClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
  
  // Get the public link record
  const linkRecord = await handle(
    serviceClient
      .from('public_treatment_links')
      .select('*')
      .eq('uuid', uuid)
      .eq('is_active', true)
      .single()
  );

  return linkRecord;

}

async function deactivatePublicTreatmentLink(uuid, userToken) {
  const client = getSupabaseClient(userToken);
  
  const updatedLink = await handle(
    client
      .from('public_treatment_links')
      .update({ is_active: false })
      .eq('uuid', uuid)
      .select()
      .single()
  );
  
  return updatedLink;
}

async function getPublicTreatmentLinksByTreatmentPlan(treatmentPlanId, userToken) {
  const client = getSupabaseClient(userToken);
  
  const links = await handle(
    client
      .from('public_treatment_links')
      .select('*')
      .eq('treatment_plan_id', treatmentPlanId)
      .order('created_at', { ascending: false })
  );
  
  return links;
}

module.exports = {
  getClients,
  getClientById,
  createClient: createClientRecord,
  updateClient,
  deleteClient,
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getBillables,
  getDisplayedBillables,
  getActiveBillables,
  getBillableById,
  getBillableByCode,
  createBillable,
  updateBillable,
  deleteBillable,
  getVisits,
  getVisitById,
  getImageById,
  createVisit,
  updateVisit,
  deleteVisit,
  getTreatmentPlans,
  getTreatmentPlansWithCosts,
  getTreatmentPlansByCreator,
  getTreatmentPlansByPresenter,
  getAllProfiles,
  getUniquePresenters,
  getUniqueCreators,
  getTreatmentPlansByProvider,
  createTreatmentPlan,
  getTreatmentPlanById,
  updateTreatmentPlan,
  deleteTreatmentPlan,
  getQuickPlans,
  getQuickPlanById,
  createQuickPlan,
  updateQuickPlan,
  deleteQuickPlan,
  createPublicTreatmentLink,
  getPublicTreatmentPlan,
  deactivatePublicTreatmentLink,
  getPublicTreatmentLinksByTreatmentPlan,

  showSchema
};
