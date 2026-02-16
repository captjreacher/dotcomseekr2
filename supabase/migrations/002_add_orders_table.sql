-- Orders table for domain purchases (mock for v1)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Domain details
  domain_name TEXT NOT NULL,
  tld TEXT NOT NULL DEFAULT 'com',

  -- Order status
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status values: pending, processing, completed, failed, cancelled

  -- Pricing
  price_cents INTEGER NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT false,

  -- Mock registration details
  registration_data JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_orders_project_id ON orders(project_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_candidate_id ON orders(candidate_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- RLS Policies
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own orders
CREATE POLICY "Users can read own orders"
  ON orders FOR SELECT
  USING (user_id = 'temp-user-id'::uuid);

-- Users can create orders
CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  WITH CHECK (user_id = 'temp-user-id'::uuid);

-- Users can update their own orders
CREATE POLICY "Users can update own orders"
  ON orders FOR UPDATE
  USING (user_id = 'temp-user-id'::uuid);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- Comments
COMMENT ON TABLE orders IS 'Mock domain purchase orders (v1 - not connected to real registration)';
COMMENT ON COLUMN orders.status IS 'Order status: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN orders.registration_data IS 'Mock registration details and metadata';
