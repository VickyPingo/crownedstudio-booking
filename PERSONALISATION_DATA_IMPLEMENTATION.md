# Personalisation Data Implementation

## Overview
Complete implementation of Date of Birth and per-person pressure preferences, with full persistence and admin visibility.

## Changes Summary

### 1. Database Schema Updates

**Migration**: `add_dob_and_per_person_pressure`

Added the following fields:

#### Customers Table
- `date_of_birth` (date): Persistent customer date of birth for identification
  - Indexed for performance on age-based queries

#### Bookings Table
- `customer_date_of_birth` (date): Snapshot of DOB at booking time for historical record
- `pressure_preferences` (jsonb): Per-person massage pressure preferences
  - Format: `{"1": "medium", "2": "soft", "3": "hard"}`
  - Indexed using GIN for efficient JSONB queries

### 2. Booking Flow Updates

#### Client Details Step
- Added required "Date of Birth" field
- Position: After phone number
- Validation: Required before proceeding
- Max date: Current date (prevents future dates)
- Consistent styling with existing form fields

#### Personalisation Step (Previously Upsells)
- Combined upsells and pressure preferences
- Each person selects:
  - **Upsells** (optional)
  - **Massage Pressure** (required): Soft, Medium, or Hard
- Person selector shows summary: "1 extra • Medium"
- Red indicator on persons without pressure selection
- Validation: All persons must select pressure before proceeding

#### Payment Summary
- Displays Date of Birth in contact details
- Shows per-person pressure preferences:
  - "Person 1 Pressure: Medium"
  - "Person 2 Pressure: Soft"
- Formatted DOB as readable date (e.g., "15 March 1990")

### 3. Data Persistence

#### Booking Creation API (`/api/bookings/create`)

**Customer Record** (New or Updated):
```typescript
{
  full_name: string
  email: string
  phone: string
  date_of_birth: string        // NEW: Persistent DOB
  allergies: string
  massage_pressure: string      // Person 1's preference used as default
  medical_notes: string
}
```

**Booking Record**:
```typescript
{
  // ... existing fields
  customer_date_of_birth: string           // NEW: DOB snapshot
  pressure_preferences: {                   // NEW: Per-person pressures
    "1": "medium",
    "2": "soft",
    "3": "hard"
  }
  allergies: string
  massage_pressure: string                  // Legacy field (Person 1)
  medical_history: string
}
```

#### Data Flow
1. User completes booking form with DOB and per-person pressures
2. **Existing customer**: Updates customer record with new DOB, allergies, pressure, medical notes
3. **New customer**: Creates customer record with all personalisation data
4. **Booking**: Stores DOB snapshot and pressure_preferences JSONB for all persons
5. **Upsells**: Already stored per-person via `booking_upsells.person_number`

### 4. Admin Dashboard Updates

#### Booking Detail Drawer

**Client Information Section**:
- Date of Birth (formatted as "15 March 1990")
- Allergies
- Medical History

**Massage Preferences Section** (NEW):
- Per-person pressure display:
  ```
  Person 1: Medium
  Person 2: Soft
  Person 3: Hard
  ```
- Fallback to legacy `massage_pressure` field if no per-person data
- Clear indication if no preferences specified

**Add-ons Section**:
- Already grouped by person (no changes needed)
- Shows person number for each upsell

#### Client Profile Page (`/admin/clients/[id]`)

**Header Display**:
- Email
- Phone
- Date of Birth (formatted, e.g., "15 March 1990")

**Edit Mode**:
- Date of Birth input field (first in grid)
- Massage Pressure dropdown
- Allergies textarea
- Medical Notes textarea
- Private Notes textarea

**Data Types Updated**:
- `CustomerProfile` interface now includes `date_of_birth`
- Edit state includes `date_of_birth`

### 5. Type Definitions

#### `types/booking.ts`
```typescript
export type PerPersonPressure = Record<number, MassagePressure>

export interface BookingFormData {
  // ... existing fields
  clientDateOfBirth: string
  pressureByPerson: PerPersonPressure
}

export interface CreateBookingPayload {
  // ... existing fields
  customerDateOfBirth: string
  pressureByPerson: PerPersonPressure
}
```

#### `types/admin.ts`
```typescript
export interface CustomerProfile {
  // ... existing fields
  date_of_birth: string | null
}

// BookingDetailDrawer interface updated with:
customer_date_of_birth: string | null
pressure_preferences: Record<string, string> | null
customer?: {
  // ... existing fields
  date_of_birth: string | null
}
```

### 6. Data Display Format

**Date of Birth**:
- Format: `en-ZA` locale
- Example: "15 March 1990"
- Uses `toLocaleDateString()` with full month name

**Pressure Preferences**:
- Capitalized (e.g., "Medium", "Soft", "Hard")
- Grouped by person in admin views
- Clear person labels: "Person 1:", "Person 2:"

## Validation Rules

### Booking Flow
1. **Personalisation Step**: All persons must select pressure (required)
2. **Client Details Step**:
   - Name, Email, Phone, Date of Birth all required
   - DOB cannot be in the future
3. **Upsells**: Optional (per person)
4. **Navigation**: Values preserved when moving back/forward

### Admin
- DOB optional in customer edit
- Max date enforced (current date)
- All fields except email/phone optional for existing customers

## Database Indexes

Performance optimizations added:
- `idx_customers_date_of_birth`: For age-based customer queries
- `idx_bookings_pressure_preferences`: GIN index for JSONB queries on pressure preferences

## Backwards Compatibility

- All new fields allow NULL for existing records
- Legacy `massage_pressure` field still populated (uses Person 1's preference)
- Admin drawer shows per-person preferences when available, falls back to legacy field
- Existing bookings without per-person data display gracefully

## Complete Data Captured

For each booking, the system now captures:

### Customer Information (Persistent)
- Full name
- Email
- Phone
- **Date of Birth** ✓
- Default allergies
- Default massage pressure
- Medical notes
- Private staff notes

### Booking Information (Snapshot)
- Customer DOB snapshot
- **Per-person pressure preferences** ✓
- Allergies (booking-specific)
- Medical history (booking-specific)
- **Per-person upsells** ✓ (already implemented)
- Service details
- Pricing
- Payment status
- Room allocation

## Admin Visibility

Staff can now view in admin:

### Booking Detail Drawer
✓ Date of Birth (snapshot from booking time)
✓ Per-person massage pressure
✓ Per-person upsells (grouped by person)
✓ Allergies
✓ Medical history
✓ All payment and booking details

### Client Profile
✓ Date of Birth (editable)
✓ Complete booking history
✓ Preferred massage pressure
✓ Allergies and medical notes
✓ Private staff notes
✓ Total spend and visit count

## Testing Checklist

- [x] Build succeeds without errors
- [x] Database migration applied successfully
- [x] Booking form includes DOB field
- [x] DOB validation works (required, no future dates)
- [x] Per-person pressure selection required
- [x] Payment summary shows DOB and pressures
- [x] API saves DOB to customers table
- [x] API saves DOB snapshot to bookings table
- [x] API saves pressure_preferences JSONB
- [x] API updates existing customers with new data
- [x] Admin booking drawer shows DOB
- [x] Admin booking drawer shows per-person pressures
- [x] Admin booking drawer shows per-person upsells
- [x] Client profile displays DOB
- [x] Client profile allows editing DOB
- [x] All TypeScript types updated
- [x] Backwards compatible with existing data

## Known Behaviors

1. **Person 1 Preference**: Used as the default `massage_pressure` field for compatibility
2. **Customer Updates**: Existing customers get updated with latest booking info (DOB, allergies, medical notes)
3. **Snapshot vs Persistent**: DOB stored on both customer (persistent) and booking (snapshot)
4. **JSONB Structure**: Pressure preferences use string keys ("1", "2", "3") not numeric for JSONB compatibility
5. **Date Display**: Always formatted in South African locale (en-ZA)

## Future Enhancements

Potential improvements for future iterations:
- Per-person allergies/medical notes
- Age-based service restrictions
- Birthday reminders for marketing
- Pressure preference analytics
- Historical preference tracking
