require('dotenv').config();

const express = require('express');
const app = express();
const { sql } = require('@vercel/postgres');
const db = require('./database.js');
const slideTemplates = require('./slideTemplates.js');
const { createServerClient } = require('@supabase/ssr');
const cors = require('cors');

const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer');
const chromium = require('@sparticuz/chromium');

// Initialize single Supabase client instance
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createServerClient(supabaseUrl, supabaseKey, {
	cookies: {
		get: () => null,
		set: () => {},
		remove: () => {}
	}
});


// Create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });


// Configure CORS to allow visits from development and production
app.use(cors({
	origin: ['http://localhost:5173', 'http://localhost:3000', 'https://guaranteeth-slides.vercel.app', /^https:\/\/.*\.vercel\.app$/],
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Accept-Version', 'Content-Length', 'Content-MD5', 'Date', 'X-Api-Version']
}));

app.use(cookieParser());
app.use(session({
	genid: () => uuidv4(),
	secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: process.env.NODE_ENV === 'production',
		httpOnly: true,
		maxAge: 24 * 60 * 60 * 1000,
		sameSite: 'strict'
	},
	name: 'sessionId'
}));

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req, res) => {
	res.status(200).send('Welcome to the Smile Design API');
});

app.post('/uploadSuccessful', urlencodedParser, async (req, res) => {
	try {
		await sql`INSERT INTO users (Id, Name, Email) VALUES (${req.body.user_id}, ${req.body.name}, ${req.body.email});`;
		res.status(200).send('<h1>User added successfully</h1>');
	} catch (error) {
		console.error(error);
		res.status(500).send('Error adding user');
	}
});

// JWT Validation Middleware - now just validates JWT and extracts user token
const validateJWT = async (req, res, next) => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'No token provided' });
		}

		const token = authHeader.split(' ')[1];
		const { data: { user }, error } = await supabase.auth.getUser(token);
		
		if (error || !user) {
			return res.status(401).json({ error: 'Invalid token' });
		}

		req.user = user;
		req.userToken = token; // Store token for passing to database functions
		next();
	} catch (error) {
		console.error('JWT validation error:', error);
		res.status(401).json({ error: 'Token validation failed' });
	}
};

// Organization Access Middleware - still needed for getting org_id for inserts
const validateOrgAccess = async (req, res, next) => {
	try {
		if (!req.user || !req.user.id) {
			return res.status(401).json({ error: 'User not authenticated' });
		}

		// Get user's organization from profiles table (still needed for inserts)
		const { data: profile, error } = await supabase
			.from('profiles')
			.select('org_id')
			.eq('auth_user_id', req.user.id)
			.single();

		if (error || !profile) {
			console.error('Profile lookup error:', error);
			return res.status(403).json({ error: 'User profile not found' });
		}

		if (!profile.org_id) {
			return res.status(403).json({ error: 'User not assigned to an organization 1' });
		}

		// Attach org_id to request for use in inserts (still needed for new records)
		req.user.org_id = profile.org_id;
		next();
	} catch (error) {
		console.error('Organization validation error:', error);
		res.status(500).json({ error: 'Organization validation failed' });
	}
};

// Combined middleware for JWT + Org validation
const validateJWTWithOrg = [validateJWT, validateOrgAccess];

// Session-based Authentication Routes
// POST /login - Username/password authentication with session creation and timing attack protection
// POST /logout - Session termination with consistent response timing
// All responses are normalized to prevent timing attacks

app.post('/register', async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) {
			return res.status(400).json({ error: 'Email and password are required' });
		}

		const { data, error } = await supabase.auth.signUp({
			email,
			password
		});

		if (error) {
			return res.status(400).json({ error: error.message });
		}
		
		res.status(201).json({ 
			message: 'User registered successfully',
			user: { id: data.user?.id, email: data.user?.email },
			session: data.session
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error registering user' });
	}
});

app.post('/login', async (req, res) => {
	const startTime = Date.now();
	const minResponseTime = 1000;
	
	try {
		const { username, password } = req.body;
		
		if (!username || !password) {
			await new Promise(resolve => setTimeout(resolve, minResponseTime - (Date.now() - startTime)));
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		const { data, error } = await supabase.auth.signInWithPassword({
			email: username,
			password
		});

		const elapsedTime = Date.now() - startTime;
		const remainingTime = Math.max(0, minResponseTime - elapsedTime);
		
		if (error || !data.user) {
			await new Promise(resolve => setTimeout(resolve, remainingTime));
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Get user's organization from profiles table
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('org_id, first_name, last_name')
			.eq('auth_user_id', data.user.id)
			.single();

		if (profileError || !profile || !profile.org_id) {
			await new Promise(resolve => setTimeout(resolve, remainingTime));
			return res.status(403).json({ error: 'User not assigned to an organization 2' });
		}

		req.session.userId = data.user.id;
		req.session.userEmail = data.user.email;
		req.session.orgId = profile.org_id;
		req.session.authenticated = true;
		req.session.loginTime = new Date().toISOString();

		await new Promise(resolve => setTimeout(resolve, remainingTime));
		
		res.status(200).json({ 
			message: 'Login successful',
			user: { 
				id: data.user.id, 
				email: data.user.email,
				org_id: profile.org_id,
				first_name: profile.first_name,
				last_name: profile.last_name
			},
			session: {
				id: req.session.id,
				authenticated: req.session.authenticated,
				loginTime: req.session.loginTime,
				expiresIn: req.session.cookie.maxAge,
				org_id: profile.org_id
			},
			accessToken: data.session?.access_token,
			refreshToken: data.session?.refresh_token
		});
	} catch (error) {
		const elapsedTime = Date.now() - startTime;
		const remainingTime = Math.max(0, minResponseTime - elapsedTime);
		
		console.error('Login error:', error);
		await new Promise(resolve => setTimeout(resolve, remainingTime));
		res.status(500).json({ error: 'Server error' });
	}
});

app.post('/refresh', async (req, res) => {
	try {
		const { refresh_token } = req.body;
		
		if (!refresh_token) {
			return res.status(400).json({ error: 'Refresh token required' });
		}

		const { data, error } = await supabase.auth.refreshSession({
			refresh_token
		});

		if (error || !data.session) {
			return res.status(401).json({ error: 'Invalid refresh token' });
		}

		res.status(200).json({
			accessToken: data.session.access_token,
			refreshToken: data.session.refresh_token,
			expiresIn: data.session.expires_in
		});
	} catch (error) {
		console.error('Refresh error:', error);
		res.status(500).json({ error: 'Token refresh failed' });
	}
});

app.post('/logout', (req, res) => {
	const startTime = Date.now();
	const minResponseTime = 500;
	
	try {
		if (req.session) {
			req.session.destroy((err) => {
				if (err) {
					console.error('Session destruction error:', err);
				}
				res.clearCookie('sessionId', {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'strict'
				});
				
				const elapsedTime = Date.now() - startTime;
				const remainingTime = Math.max(0, minResponseTime - elapsedTime);
				
				setTimeout(() => {
					res.status(200).json({ message: 'Logout successful' });
				}, remainingTime);
			});
		} else {
			const elapsedTime = Date.now() - startTime;
			const remainingTime = Math.max(0, minResponseTime - elapsedTime);
			
			setTimeout(() => {
				res.status(200).json({ message: 'Logout successful' });
			}, remainingTime);
		}
	} catch (error) {
		console.error('Logout error:', error);
		const elapsedTime = Date.now() - startTime;
		const remainingTime = Math.max(0, minResponseTime - elapsedTime);
		
		setTimeout(() => {
			res.status(500).json({ error: 'Server error' });
		}, remainingTime);
	}
});

app.get('/api/protected', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await db.getUserFromToken(token);
    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

app.get('/users', validateJWTWithOrg, async (req, res) => {
	try {
		// Note: User management is now handled by Supabase Auth
		// This endpoint returns the authenticated user's information
		res.status(200).json({
			message: 'Get authenticated user',
			data: { 
				id: req.user.id, 
				email: req.user.email,
				created_at: req.user.created_at
			}
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving user information' });
	}
});

// Clients Routes
app.get('/clients', validateJWTWithOrg, async (req, res) => {
	try {
		const clients = await db.getClients(req.userToken);
		res.status(200).json({
			message: 'Get all clients',
			data: clients
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving clients' });
	}
});

app.get('/clients/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const client = await db.getClientById(id, req.userToken);
		res.status(200).json({
			message: `Get client by ID: ${id}`,
			data: client
		});
	} catch (error) {
		console.error(error);
		res.status(404).json({ error: 'Client not found' });
	}
});

app.post('/clients', validateJWTWithOrg, async (req, res) => {
	try {
		const client = await db.createClient(req.body, req.userToken, req.user.org_id);
		res.status(201).json({
			message: 'Client created successfully',
			data: client
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error creating client' });
	}
});

app.put('/clients/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const client = await db.updateClient(id, req.body, req.userToken);
		res.status(200).json({
			message: `Client ID: ${id} updated successfully`,
			data: client
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error updating client' });
	}
});

app.delete('/clients/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		await db.deleteClient(id, req.userToken);
		res.status(200).json({
			message: `Client ID: ${id} deleted successfully`,
			deleted: id
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting client' });
	}
});

// Providers Routes
app.get('/providers', validateJWTWithOrg, async (req, res) => {
	try {
		const providers = await db.getProviders(req.userToken);
		res.status(200).json({
			message: 'Get all providers',
			data: providers
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving providers' });
	}
});

app.post('/providers', validateJWTWithOrg, async (req, res) => {
	try {
		const provider = await db.createProvider(req.body, req.userToken, req.user.org_id);
		res.status(201).json({
			message: 'Provider created successfully',
			data: provider
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error creating provider' });
	}
});

app.put('/providers/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const provider = await db.updateProvider(id, req.body, req.userToken);
		res.status(200).json({
			message: `Provider ID: ${id} updated successfully`,
			data: provider
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error updating provider' });
	}
});

app.delete('/providers/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		await db.deleteProvider(id, req.userToken);
		res.status(200).json({
			message: `Provider ID: ${id} deleted successfully`,
			deleted: id
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting provider' });
	}
});

// Billables Routes
app.get('/billables', validateJWTWithOrg, async (req, res) => {
	try {
		const { displayed } = req.query;
		const billables = displayed === 'true' 
			? await db.getDisplayedBillables(req.userToken)
			: await db.getBillables(req.userToken);
		res.status(200).json({
			message: displayed === 'true' ? 'Get displayed billables' : 'Get all billables',
			data: billables
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving billables' });
	}
});

app.get('/billables/displayed', validateJWTWithOrg, async (req, res) => {
	try {
		const billables = await db.getDisplayedBillables(req.userToken);
		res.status(200).json({
			message: 'Get displayed billables',
			data: billables
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving displayed billables' });
	}
});

app.get('/billables/active', validateJWTWithOrg, async (req, res) => {
	try {
		const billables = await db.getActiveBillables(req.userToken);
		res.status(200).json({
			message: 'Get active billables',
			data: billables
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving active billables' });
	}
});

app.get('/billables/:code', validateJWTWithOrg, async (req, res) => {
	try {
		const { code } = req.params;
		const billable = await db.getBillableById(code, req.userToken);
		res.status(200).json({
			message: `Get billable by code: ${code}`,
			data: billable
		});
	} catch (error) {
		console.error(error);
		res.status(404).json({ error: 'Billable not found' });
	}
});

app.post('/billables', validateJWTWithOrg, async (req, res) => {
	try {
		const billable = await db.createBillable(req.body, req.userToken, req.user.org_id);
		res.status(201).json({
			message: 'Billable created successfully',
			data: billable
		});
	} catch (error) {
		console.error(error);
		// Check if this is a duplicate billable code error
		if (error.message && error.message.includes('already exists for this organization')) {
			res.status(400).json({ error: error.message });
		} else {
			res.status(500).json({ error: 'Error creating billable' });
		}
	}
});

app.put('/billables/:code', validateJWTWithOrg, async (req, res) => {
	try {
		const { code } = req.params;
		console.log(`Updating billable with code: ${code}`, req.body);
		
		const billable = await db.updateBillable(code, req.body, req.userToken);
		res.status(200).json({
			message: `Billable code: ${code} updated successfully`,
			data: billable
		});
	} catch (error) {
		console.error('Error updating billable:', error);
		
		// Provide more specific error messages
		if (error.message?.includes('not found')) {
			res.status(404).json({ 
				error: `Billable with code '${req.params.code}' not found`,
				details: error.message 
			});
		} else if (error.message?.includes('multiple')) {
			res.status(400).json({ 
				error: `Multiple billables found with code '${req.params.code}' - database integrity issue`,
				details: error.message 
			});
		} else {
			res.status(500).json({ 
				error: 'Error updating billable',
				details: error.message || 'Unknown error'
			});
		}
	}
});

app.delete('/billables/:code', validateJWTWithOrg, async (req, res) => {
	try {
		const { code } = req.params;
		await db.deleteBillable(code, req.userToken);
		res.status(200).json({
			message: `Billable code: ${code} deleted successfully`,
			deleted: code
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting billable ' + error });
	}
});

// Visits Routes
app.get('/visits', validateJWTWithOrg, async (req, res) => {
	try {
		const visits = await db.getVisits(req.userToken);
		res.status(200).json({
			message: 'Get all visits',
			data: visits
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving visits' });
	}
});

app.get('/visits/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const visit = await db.getVisitById(id, req.userToken);
		res.status(200).json({
			message: `Get visit by ID: ${id}`,
			data: visit
		});
	} catch (error) {
		console.error(error);
		res.status(404).json({ error: 'Visit not found' });
	}
});

app.post('/visits', validateJWTWithOrg, async (req, res) => {
	try {
		
		const visit = await db.createVisit(req.body, req.userToken, req.user.org_id, req.user.id);
		res.status(201).json({
			message: 'Visit created successfully',
			data: visit
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error creating visit ' + error });
	}
});

app.put('/visits/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const visit = await db.updateVisit(id, req.body, req.userToken);
		res.status(200).json({
			message: `Visit ID: ${id} updated successfully`,
			data: visit
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error updating visit ' + error });
	}
});

app.delete('/visits/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		await db.deleteVisit(id, req.userToken);
		res.status(200).json({
			message: `Visit ID: ${id} deleted successfully`,
			deleted: id
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting visit ' + error });
	}
});

// Treatment Plans Summary Route
app.get('/treatment-plans-summary', validateJWTWithOrg, async (req, res) => {
	try {
		const treatmentPlansWithCosts = await db.getTreatmentPlansWithCosts(req.userToken);
		res.status(200).json({
			message: 'Get all treatment plans with option costs',
			data: treatmentPlansWithCosts
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving treatment plans with costs' });
	}
});

// Get All Profiles Route
app.get('/profiles', validateJWTWithOrg, async (req, res) => {
	try {
		const profiles = await db.getAllProfiles(req.userToken);
		res.status(200).json({
			message: 'Get all profiles in organization',
			data: profiles
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving profiles' });
	}
});

// Get Unique Presenters Route
app.get('/presenters', validateJWTWithOrg, async (req, res) => {
	try {
		const presenters = await db.getUniquePresenters(req.userToken);
		res.status(200).json({
			message: 'Get unique presenters from treatment plans',
			data: presenters
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving presenters' });
	}
});

// Get Unique Creators Route
app.get('/creators', validateJWTWithOrg, async (req, res) => {
	try {
		const creators = await db.getUniqueCreators(req.userToken);
		res.status(200).json({
			message: 'Get unique creators from treatment plans',
			data: creators
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving creators' });
	}
});

// Treatment Plans by Creator Route
app.get('/treatment-plans/by-creator/:creatorId', validateJWTWithOrg, async (req, res) => {
	try {
		const { creatorId } = req.params;
		const { startDate, endDate } = req.query;
		const treatmentPlans = await db.getTreatmentPlansByCreator(creatorId, req.userToken, startDate, endDate);
		res.status(200).json({
			message: `Get treatment plans created by user: ${creatorId}`,
			data: treatmentPlans
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving treatment plans by creator' });
	}
});

// Treatment Plans by Presenter Route
app.get('/treatment-plans/by-presenter/:presenterId', validateJWTWithOrg, async (req, res) => {
	try {
		const { presenterId } = req.params;
		const { startDate, endDate } = req.query;
		const treatmentPlans = await db.getTreatmentPlansByPresenter(presenterId, req.userToken, startDate, endDate);
		res.status(200).json({
			message: `Get treatment plans presented by user: ${presenterId}`,
			data: treatmentPlans
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving treatment plans by presenter' });
	}
});

// Treatment Plans by Provider Route
app.get('/treatment-plans/by-provider/:providerId', validateJWTWithOrg, async (req, res) => {
	try {
		const { providerId } = req.params;
		const { startDate, endDate } = req.query;
		const treatmentPlans = await db.getTreatmentPlansByProvider(parseInt(providerId), req.userToken, startDate, endDate);
		res.status(200).json({
			message: `Get treatment plans for provider: ${providerId}`,
			data: treatmentPlans
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving treatment plans by provider' });
	}
});

// Treatment Plans Routes
app.get('/treatment-plans', validateJWTWithOrg, async (req, res) => {
	try {
		const treatmentPlans = await db.getTreatmentPlans(req.userToken);
		res.status(200).json({
			message: 'Get all treatment plans',
			data: treatmentPlans
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving treatment plans' });
	}
});

app.get('/treatment-plans/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const treatmentPlan = await db.getTreatmentPlanById(id, req.userToken);
		res.status(200).json({
			message: `Get treatment plan by ID: ${id}`,
			data: treatmentPlan
		});
	} catch (error) {
		console.error(error);
		res.status(404).json({ error: 'Treatment plan not found' });
	}
});

app.post('/treatment-plans', validateJWTWithOrg, async (req, res) => {
	try {
		const treatmentPlan = await db.createTreatmentPlan(req.body, req.userToken, req.user.org_id, req.user.id);
		res.status(201).json({
			message: 'Treatment plan created successfully',
			data: treatmentPlan
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error creating treatment plan ' + error });
	}
});

app.put('/treatment-plans/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const treatmentPlan = await db.updateTreatmentPlan(id, req.body, req.userToken);
		res.status(200).json({
			message: `Treatment plan ID: ${id} updated successfully`,
			data: treatmentPlan
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error updating treatment plan ' + error });
	}
});

app.delete('/treatment-plans/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		await db.deleteTreatmentPlan(id, req.userToken);
		res.status(200).json({
			message: `Treatment plan ID: ${id} deleted successfully`,
			deleted: id
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting treatment plan ' + error });
	}
});

// Public Treatment Links Routes
app.post('/treatment-plans/:id/generate-public-link', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const { expires_in_hours } = req.body; // Optional expiration
		
		// Get organization info from user's profile (already available from middleware)
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select(`
				org_id,
				organizations (
					name,
					code
				)
			`)
			.eq('auth_user_id', req.user.id)
			.single();

		if (profileError || !profile || !profile.organizations) {
			return res.status(403).json({ error: 'Organization information not found' });
		}

		// Calculate expiration date if provided
		let expiresAt = null;
		if (expires_in_hours && expires_in_hours > 0) {
			expiresAt = new Date();
			expiresAt.setHours(expiresAt.getHours() + expires_in_hours);
		}

		const publicLink = await db.createPublicTreatmentLink(
			parseInt(id),
			req.userToken,
			req.user.org_id,
			profile.organizations.name,
			profile.organizations.code
		);

		// Update expiration if provided
		if (expiresAt) {
			const { data: updatedLink } = await supabase
				.from('public_treatment_links')
				.update({ expires_at: expiresAt.toISOString() })
				.eq('uuid', publicLink.uuid)
				.select()
				.single();
			
			if (updatedLink) {
				publicLink.expires_at = updatedLink.expires_at;
			}
		}

		res.status(201).json({
			message: 'Public treatment plan link created successfully',
			data: {
				uuid: publicLink.uuid,
				link: `public/treatment-plan/${publicLink.uuid}`,
				treatment_plan_id: publicLink.treatment_plan_id,
				created_at: publicLink.created_at,
				expires_at: publicLink.expires_at,
				is_active: publicLink.is_active
			}
		});
	} catch (error) {
		console.error('Error creating public treatment plan link:', error);
		res.status(500).json({ 
			error: 'Error creating public treatment plan link',
			details: error.message 
		});
	}
});

app.get('/public/treatment-plan/:uuid', async (req, res) => {
	try {
		const { uuid } = req.params;
		
		// Validate UUID format
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(uuid)) {
			return res.status(400).json({ error: 'Invalid UUID format' });
		}

		const publicData = await db.getPublicTreatmentPlan(uuid);
		
		res.status(200).json({
			message: 'Public treatment plan retrieved successfully',
			data: publicData
		});
	} catch (error) {
		console.error('Error retrieving public treatment plan:', error);
		
		if (error.message.includes('not found') || error.message.includes('expired')) {
			res.status(404).json({ error: error.message });
		} else {
			res.status(500).json({ 
				error: 'Error retrieving public treatment plan',
				details: error.message 
			});
		}
	}
});

// Deactivate public link (optional management route)
app.put('/public-links/:uuid/deactivate', validateJWTWithOrg, async (req, res) => {
	try {
		const { uuid } = req.params;
		
		const deactivatedLink = await db.deactivatePublicTreatmentLink(uuid, req.userToken);
		
		res.status(200).json({
			message: 'Public treatment plan link deactivated successfully',
			data: deactivatedLink
		});
	} catch (error) {
		console.error('Error deactivating public treatment plan link:', error);
		res.status(500).json({ 
			error: 'Error deactivating public treatment plan link',
			details: error.message 
		});
	}
});

// Get all public links for a treatment plan (optional management route)
app.get('/treatment-plans/:id/public-links', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		
		const links = await db.getPublicTreatmentLinksByTreatmentPlan(parseInt(id), req.userToken);
		
		res.status(200).json({
			message: `Get public links for treatment plan ${id}`,
			data: links
		});
	} catch (error) {
		console.error('Error retrieving public treatment plan links:', error);
		res.status(500).json({ 
			error: 'Error retrieving public treatment plan links',
			details: error.message 
		});
	}
});

// Quick Plans Routes
app.get('/quick-plans', validateJWTWithOrg, async (req, res) => {
	try {
		const quickPlans = await db.getQuickPlans(req.userToken);
		res.status(200).json({
			message: 'Get all quick plans',
			data: quickPlans
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving quick plans' });
	}
});

app.get('/quick-plans/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const quickPlan = await db.getQuickPlanById(id, req.userToken);
		res.status(200).json({
			message: `Get quick plan by ID: ${id}`,
			data: quickPlan
		});
	} catch (error) {
		console.error(error);
		res.status(404).json({ error: 'Quick plan not found' });
	}
});

app.post('/quick-plans', validateJWTWithOrg, async (req, res) => {
	try {
		const quickPlan = await db.createQuickPlan(req.body, req.userToken, req.user.org_id);
		res.status(201).json({
			message: 'Quick plan created successfully',
			data: quickPlan
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error creating quick plan ' + error });
	}
});

app.put('/quick-plans/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const quickPlan = await db.updateQuickPlan(id, req.body, req.userToken);
		res.status(200).json({
			message: `Quick plan ID: ${id} updated successfully`,
			data: quickPlan
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error updating quick plan ' + error });
	}
});

app.delete('/quick-plans/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		await db.deleteQuickPlan(id, req.userToken);
		res.status(200).json({
			message: `Quick plan ID: ${id} deleted successfully`,
			deleted: id
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting quick plan ' + error });
	}
});

// Settings Routes
app.get('/settings/display-codes', validateJWTWithOrg, async (req, res) => {
	try {
		// For now, get all display codes from billables that are marked as displayed
		const displayCodes = await db.getDisplayedBillables(req.userToken);
		res.status(200).json({
			message: 'Get display codes settings',
			data: displayCodes.map(b => b.billable_code)
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving display codes settings' });
	}
});

app.put('/settings/display-codes', validateJWTWithOrg, async (req, res) => {
	try {
		const { codes } = req.body;
		if (!Array.isArray(codes)) {
			return res.status(400).json({ error: 'Codes must be an array' });
		}

		console.log('Updating display codes for:', codes);

		// First, set all billables to not displayed
		const allBillables = await db.getBillables(req.userToken);
		console.log(`Found ${allBillables.length} total billables`);
		
		for (const billable of allBillables) {
			try {
				await db.updateBillable(billable.id, { is_displayed: false }, req.userToken);
			} catch (error) {
				console.error(`Failed to set billable ${billable.id} to not displayed:`, error);
				// Continue with other billables rather than failing completely
			}
		}

		// Then set the selected codes to displayed
		const updatedCodes = [];
		const failedCodes = [];
		
		for (const code of codes) {
			try {
				const billable = await db.getBillableByCode(code, req.userToken);
				if (billable) {
					await db.updateBillable(billable.id, { is_displayed: true }, req.userToken);
					updatedCodes.push(code);
					console.log(`Successfully set billable ${code} to displayed`);
				} else {
					console.warn(`Billable with code ${code} not found`);
					failedCodes.push({ code, reason: 'Billable not found' });
				}
			} catch (error) {
				console.error(`Failed to set billable ${code} to displayed:`, error);
				failedCodes.push({ code, reason: error.message || 'Unknown error' });
			}
		}

		const result = {
			message: 'Display codes settings updated',
			data: updatedCodes,
			...(failedCodes.length > 0 && { 
				warnings: `Some codes could not be updated: ${failedCodes.map(f => `${f.code} (${f.reason})`).join(', ')}`,
				failed_codes: failedCodes 
			})
		};

		console.log('Display codes update result:', result);
		res.status(200).json(result);
	} catch (error) {
		console.error('Error updating display codes settings:', error);
		res.status(500).json({ 
			error: 'Error updating display codes settings',
			details: error.message 
		});
	}
});

// Images Routes
app.get('/images/:id', validateJWTWithOrg, (req, res) => {
	const { id } = req.params;
	res.status(200).json({
		message: `Get image by ID: ${id} - not implemented`,
		data: { id, url: `placeholder-image-url-${id}` }
	});
});


// Slide Template Settings Routes
app.get('/slide-template-settings', validateJWTWithOrg, async (req, res) => {
	try {
		const settings = await slideTemplates.getSlideTemplateSettings(req.userToken, req.user.id);
		res.status(200).json({
			message: 'Get slide template settings for current user',
			data: settings
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving slide template settings' });
	}
});

app.get('/slide-template-settings/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const setting = await slideTemplates.getSlideTemplateSettingById(id, req.userToken);
		res.status(200).json({
			message: `Get slide template setting by ID: ${id}`,
			data: setting
		});
	} catch (error) {
		console.error(error);
		res.status(404).json({ error: 'Slide template setting not found' });
	}
});

app.post('/slide-template-settings', validateJWTWithOrg, async (req, res) => {
	try {
		const setting = await slideTemplates.createSlideTemplateSetting(req.body, req.userToken, req.user.id);
		res.status(201).json({
			message: 'Slide template setting created successfully',
			data: setting
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error creating slide template setting' });
	}
});

app.put('/slide-template-settings/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		const setting = await slideTemplates.updateSlideTemplateSetting(id, req.body, req.userToken);
		res.status(200).json({
			message: `Slide template setting ID: ${id} updated successfully`,
			data: setting
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error updating slide template setting' });
	}
});

app.delete('/slide-template-settings/:id', validateJWTWithOrg, async (req, res) => {
	try {
		const { id } = req.params;
		await slideTemplates.deleteSlideTemplateSetting(id, req.userToken);
		res.status(200).json({
			message: `Slide template setting ID: ${id} deleted successfully`,
			deleted: id
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error deleting slide template setting' });
	}
});

// User-specific slide template settings routes
app.get('/users/:userId/slide-template-settings', validateJWTWithOrg, async (req, res) => {
	try {
		const { userId } = req.params;
		const settings = await slideTemplates.getSlideTemplateSettingsByUser(userId, req.userToken);
		res.status(200).json({
			message: `Get slide template settings for user: ${userId}`,
			data: settings
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error retrieving user slide template settings' });
	}
});




// Utility Routes
app.get('/schema', (req, res) => {
	res.status(200).json({
		message: 'Database schema - not implemented',
		schema: {}
	});
});

// Test CRUD endpoints
app.get('/api/test', (req, res) => {
	res.status(200).json({
		message: 'Test GET endpoint working',
		timestamp: new Date().toISOString(),
		data: { id: 1, name: 'Test Item', status: 'active' }
	});
});

app.post('/api/test', (req, res) => {
	const { name, status } = req.body;
	res.status(201).json({
		message: 'Test POST endpoint working',
		created: { id: Date.now(), name, status },
		timestamp: new Date().toISOString()
	});
});

app.put('/api/test/:id', (req, res) => {
	const { id } = req.params;
	const { name, status } = req.body;
	res.status(200).json({
		message: 'Test PUT endpoint working',
		updated: { id: parseInt(id), name, status },
		timestamp: new Date().toISOString()
	});
});

app.delete('/api/test/:id', (req, res) => {
	const { id } = req.params;
	res.status(200).json({
		message: 'Test DELETE endpoint working',
		deleted: { id: parseInt(id) },
		timestamp: new Date().toISOString()
	});
});

// Update root endpoint to return API message instead of HTML
app.get('/api', (req, res) => {
	res.status(200).json({
		message: 'Smile Design Manhattan API',
		version: '1.0.0',
		timestamp: new Date().toISOString()
	});
});

app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
