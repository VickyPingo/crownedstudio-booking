/*
  # Create Base Schema for Crowned Studio Booking System

  ## Tables Created

  ### 1. customers
  - `id` (uuid, primary key)
  - `full_name` (text)
  - `email` (text, unique)
  - `phone` (text)
  - `date_of_birth` (date)
  - `allergies` (text)
  - `massage_pressure` (text)
  - `medical_notes` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. services
  - `id` (uuid, primary key)
  - `name` (text)
  - `slug` (text, unique)
  - `description` (text)
  - `duration_minutes` (integer)
  - `base_price` (integer)
  - `max_people` (integer)
  - `active` (boolean)
  - `service_area` (text)
  - `weekend_surcharge_pp` (integer)
  - `created_at` (timestamptz)

  ### 3. upsells
  - `id` (uuid, primary key)
  - `service_id` (uuid, foreign key)
  - `name` (text)
  - `description` (text)
  - `price` (integer)
  - `duration_added_minutes` (integer)
  - `active` (boolean)
  - `created_at` (timestamptz)

  ### 4. rooms
  - `id` (uuid, primary key)
  - `name` (text, unique)
  - `service_area` (text)
  - `capacity` (integer)
  - `active` (boolean)
  - `priority` (integer)
  - `created_at` (timestamptz)

  ### 5. bookings
  - `id` (uuid, primary key)
  - `customer_id` (uuid, foreign key)
  - `service_slug` (text)
  - `room_id` (uuid, foreign key, nullable)
  - `people_count` (integer)
  - `status` (text)
  - `start_time` (timestamptz)
  - `end_time` (timestamptz)
  - `base_price` (integer)
  - `upsells_total` (integer)
  - `weekend_surcharge_amount` (integer)
  - `discount_amount` (integer)
  - `discount_type` (text)
  - `total_price` (integer)
  - `deposit_due` (integer)
  - `balance_paid` (boolean)
  - `payment_expires_at` (timestamptz)
  - `allergies` (text)
  - `massage_pressure` (text)
  - `medical_history` (text)
  - `customer_date_of_birth` (date)
  - `pressure_preferences` (jsonb)
  - `is_pregnant` (boolean)
  - `pregnancy_weeks` (integer)
  - `pricing_option_name` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 6. booking_upsells
  - `id` (uuid, primary key)
  - `booking_id` (uuid, foreign key)
  - `upsell_id` (uuid, foreign key)
  - `person_number` (integer)
  - `price_at_booking` (integer)
  - `created_at` (timestamptz)

  ### 7. public_holidays
  - `id` (uuid, primary key)
  - `date` (date, unique)
  - `name` (text)
  - `active` (boolean)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated and anonymous access
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  date_of_birth date,
  allergies text,
  massage_pressure text DEFAULT 'medium',
  medical_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  duration_minutes integer NOT NULL,
  base_price integer NOT NULL,
  max_people integer DEFAULT 1,
  active boolean DEFAULT true,
  service_area text DEFAULT 'treatment',
  weekend_surcharge_pp integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create upsells table
CREATE TABLE IF NOT EXISTS upsells (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price integer NOT NULL,
  duration_added_minutes integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text UNIQUE NOT NULL,
  service_area text NOT NULL,
  capacity integer DEFAULT 1,
  active boolean DEFAULT true,
  priority integer DEFAULT 100,
  created_at timestamptz DEFAULT now()
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  service_slug text NOT NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  people_count integer DEFAULT 1,
  status text DEFAULT 'pending_payment',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  base_price integer NOT NULL,
  upsells_total integer DEFAULT 0,
  weekend_surcharge_amount integer DEFAULT 0,
  discount_amount integer DEFAULT 0,
  discount_type text,
  total_price integer NOT NULL,
  deposit_due integer NOT NULL,
  balance_paid boolean DEFAULT false,
  payment_expires_at timestamptz,
  allergies text,
  massage_pressure text,
  medical_history text,
  customer_date_of_birth date,
  pressure_preferences jsonb DEFAULT '{}'::jsonb,
  is_pregnant boolean DEFAULT false,
  pregnancy_weeks integer,
  pricing_option_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create booking_upsells junction table
CREATE TABLE IF NOT EXISTS booking_upsells (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
  upsell_id uuid REFERENCES upsells(id) ON DELETE CASCADE NOT NULL,
  person_number integer DEFAULT 1,
  price_at_booking integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create public_holidays table
CREATE TABLE IF NOT EXISTS public_holidays (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date date UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_date_of_birth ON customers(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);
CREATE INDEX IF NOT EXISTS idx_upsells_service_id ON upsells(service_id);
CREATE INDEX IF NOT EXISTS idx_rooms_service_area ON rooms(service_area);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms(active);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_slug ON bookings(service_slug);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_end_time ON bookings(end_time);
CREATE INDEX IF NOT EXISTS idx_bookings_pressure_preferences ON bookings USING gin(pressure_preferences);
CREATE INDEX IF NOT EXISTS idx_booking_upsells_booking_id ON booking_upsells(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_upsells_upsell_id ON booking_upsells(upsell_id);
CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(date);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers
CREATE POLICY "Allow anonymous read access to customers" ON customers
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous insert to customers" ON customers
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous update to customers" ON customers
  FOR UPDATE TO anon USING (true);

-- RLS Policies for services
CREATE POLICY "Allow anonymous read access to services" ON services
  FOR SELECT TO anon USING (active = true);

CREATE POLICY "Allow authenticated full access to services" ON services
  FOR ALL TO authenticated USING (true);

-- RLS Policies for upsells
CREATE POLICY "Allow anonymous read access to upsells" ON upsells
  FOR SELECT TO anon USING (active = true);

CREATE POLICY "Allow authenticated full access to upsells" ON upsells
  FOR ALL TO authenticated USING (true);

-- RLS Policies for rooms
CREATE POLICY "Allow anonymous read access to rooms" ON rooms
  FOR SELECT TO anon USING (active = true);

CREATE POLICY "Allow authenticated full access to rooms" ON rooms
  FOR ALL TO authenticated USING (true);

-- RLS Policies for bookings
CREATE POLICY "Allow anonymous read access to bookings" ON bookings
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous insert to bookings" ON bookings
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous update to bookings" ON bookings
  FOR UPDATE TO anon USING (true);

CREATE POLICY "Allow authenticated full access to bookings" ON bookings
  FOR ALL TO authenticated USING (true);

-- RLS Policies for booking_upsells
CREATE POLICY "Allow anonymous read access to booking_upsells" ON booking_upsells
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous insert to booking_upsells" ON booking_upsells
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated full access to booking_upsells" ON booking_upsells
  FOR ALL TO authenticated USING (true);

-- RLS Policies for public_holidays
CREATE POLICY "Allow anonymous read access to public_holidays" ON public_holidays
  FOR SELECT TO anon USING (active = true);

CREATE POLICY "Allow authenticated full access to public_holidays" ON public_holidays
  FOR ALL TO authenticated USING (true);
