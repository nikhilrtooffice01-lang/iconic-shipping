CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  company VARCHAR(190),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(40) NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  company VARCHAR(190),
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40),
  vessel VARCHAR(190),
  imo VARCHAR(50),
  port VARCHAR(120),
  eta TIMESTAMPTZ,
  service VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'New'
    CHECK (status IN ('New','Processing','Quoted','Completed','Closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_user_id ON enquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at DESC);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  quote_number VARCHAR(60) NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  valid_until DATE,
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_enquiry_id ON quotes(enquiry_id);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(190) NOT NULL UNIQUE,
  short_description TEXT NOT NULL,
  details TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO services(name, short_description, details, sort_order) VALUES
('Main & Auxiliary Engine Spares','Main and auxiliary engine spare coordination.','Share maker, engine model, part number, quantity, vessel port and ETA for requirement processing.',1),
('Compressors, Oil Separators, Pumps & Motors','Machinery and rotating-equipment supply coordination.','Share equipment maker/model, technical specification, quantity and delivery window.',2),
('Electrical & Electronic Equipment','Marine electrical and electronic equipment sourcing.','Share model, rating, maker, quantity and vessel details.',3),
('Deck Stores','Routine deck stores and ship-chandling requirements.','Send your deck-store list with sizes, quantities, port and ETA.',4),
('Provisions & Bonded Stores','Provision and bonded-store coordination.','Send the requested list, quantities and vessel delivery window.',5),
('Marine Paints, Lube Oil & Fresh Water','Essential marine consumables.','Share grade/product, maker preference, quantity, port and ETA.',6),
('LSA / FFA Inspections & Certifications','Safety equipment inspection/certification coordination.','Share equipment/certificate details, inspection scope, vessel and required date.',7),
('Repair Works, Crane Services & Hatch Cleaning','Port-side technical service coordination.','Share scope, equipment/hatch details, port and working window.',8)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(80),
  entity_id UUID,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
