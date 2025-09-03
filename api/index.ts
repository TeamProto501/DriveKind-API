require('dotenv').config();

const express = require('express');
const app = express();
const { sql } = require('@vercel/postgres');
const db = require('./database.js');
const { createServerClient } = require('@supabase/ssr');
const cors = require('cors');

const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');


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



app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
