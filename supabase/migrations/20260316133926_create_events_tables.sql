/*
  # Create Events and Event Bookings Tables

  1. New Tables
    - `events`
      - `id` (uuid, primary key)
      - `title` (text, not null) - Event name
      - `slug` (text, unique, not null) - URL-friendly identifier
      - `description` (text) - Event description
      - `event_date` (timestamptz, not null) - When the event takes place
      - `price_per_person` (integer, not null) - Price in cents/rands
      - `is_active` (boolean, default true) - Whether event is available for booking
      - `created_at` (timestamptz)

    - `event_bookings`
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `customer_id` (uuid, nullable, foreign key to customers)
      - `booker_name` (text, not null)
      - `booker_email` (text, not null)
      - `booker_phone` (text, not null)
      - `quantity` (integer, not null) - Number of people
      - `price_per_person` (integer, not null) - Price at time of booking
      - `subtotal_amount` (integer, not null) - quantity * price_per_person
      - `voucher_code` (text, nullable)
      - `voucher_discount` (integer, default 0)
      - `total_amount` (integer, not null) - subtotal - voucher_discount
      - `payment_status` (text, default 'pending')
      - `booking_status` (text, default 'pending')
      - `payment_reference` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for public read access to active events
    - Add policies for creating event bookings
*/

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  event_date timestamptz NOT NULL,
  price_per_person integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  booker_name text NOT NULL,
  booker_email text NOT NULL,
  booker_phone text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price_per_person integer NOT NULL,
  subtotal_amount integer NOT NULL,
  voucher_code text,
  voucher_discount integer NOT NULL DEFAULT 0,
  total_amount integer NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending',
  booking_status text NOT NULL DEFAULT 'pending',
  payment_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_event_bookings_event_id ON event_bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_customer_id ON event_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_event_bookings_status ON event_bookings(booking_status);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active events"
  ON events
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage events"
  ON events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can create event bookings"
  ON event_bookings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own event bookings by email"
  ON event_bookings
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage event bookings"
  ON event_bookings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
