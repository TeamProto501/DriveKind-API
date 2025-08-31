-- Migration: Create public_treatment_links table
-- This table stores UUID-based links for publicly sharing treatment plans

CREATE TABLE public_treatment_links (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  treatment_plan_id BIGINT NOT NULL,
  org_id BIGINT NOT NULL,
  org_name TEXT NOT NULL,
  org_code TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  
  FOREIGN KEY (treatment_plan_id) REFERENCES treatment_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index on uuid for fast lookups
CREATE INDEX idx_public_treatment_links_uuid ON public_treatment_links(uuid);

-- Create index on treatment_plan_id for reverse lookups
CREATE INDEX idx_public_treatment_links_treatment_plan_id ON public_treatment_links(treatment_plan_id);

-- Create index on active links
CREATE INDEX idx_public_treatment_links_active ON public_treatment_links(is_active) WHERE is_active = true;

-- Enable RLS (Row Level Security)
ALTER TABLE public_treatment_links ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see/manage links for their organization
CREATE POLICY "Users can manage their org's treatment links" ON public_treatment_links
  USING (org_id = (
    SELECT profiles.org_id 
    FROM profiles 
    WHERE profiles.auth_user_id = auth.uid()
  ));