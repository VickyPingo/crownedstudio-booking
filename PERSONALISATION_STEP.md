# Personalisation Step UX Improvement

## Overview
The Personalisation step has been restructured to prioritize required preference fields above optional add-ons, ensuring users don't miss the mandatory massage pressure selection.

## Latest Update (Layout Restructure)
Moved the "Preferred Massage Pressure" section ABOVE the add-ons list to ensure it's immediately visible and completed first.

## Changes Made

### 1. New Step Structure
- **Old**: Separate "Upsells" step (step 2)
- **New**: Combined "Personalisation" step (step 2)
  - Includes upsells selection (optional)
  - Includes massage pressure preference (required)

### 2. Data Structure Updates

#### Updated Types (`types/booking.ts`)
```typescript
export type PerPersonPressure = Record<number, MassagePressure>

export interface BookingFormData {
  // ... existing fields
  pressureByPerson: PerPersonPressure  // NEW: Stores pressure per person
}
```

### 3. New Component: PersonalisationStep

**File**: `components/booking-steps/PersonalisationStep.tsx`

#### Features
- Person selector tabs at the top (for multi-person bookings)
- Two sections per person:
  1. **Add Extras (Optional)**: Existing upsell UI
  2. **Preferred Massage Pressure (Required)**: New pressure selection
- Visual indicators:
  - Red dot on person tab if pressure not set
  - Summary on each tab showing extras count and pressure
  - Validation ensures all persons have selected pressure

#### Pressure Options
- **Soft**: Gentle, relaxing pressure
- **Medium**: Balanced, therapeutic pressure
- **Hard**: Deep tissue, firm pressure

### 4. Updated Components

#### ClientDetailsStep
- Removed massage pressure selection (moved to Personalisation)
- Now only contains:
  - Contact information (name, email, phone)
  - Health information (allergies, medical history)

#### BookingModal
- Updated step definition from "Upsells" to "Personalisation"
- Added `pressureByPerson` to form state
- Updated validation: Step 1 requires all persons to have pressure selected
- Step 3 (Client Details) no longer requires pressure

#### PaymentStep
- Updated to display per-person pressure preferences
- Uses Person 1's pressure as the main customer pressure field
- Shows pressure for each person in the summary

### 5. User Experience

#### Single Person Booking
```
┌─────────────────────────────────┐
│ Personalisation                 │
├─────────────────────────────────┤
│ Add Extras (Optional)           │
│ ☐ Hot Stone Massage      R150   │
│ ☐ Aromatherapy Oil       R80    │
│                                 │
│ Preferred Massage Pressure *    │
│ ⦿ Soft  ○ Medium  ○ Hard       │
└─────────────────────────────────┘
```

#### Multi-Person Booking
```
┌─────────────────────────────────┐
│ Personalisation                 │
├─────────────────────────────────┤
│ [Person 1: 1 extra • Medium]    │
│ [Person 2: Not set] 🔴          │
│                                 │
│ Personalising for Person 1      │
│                                 │
│ Add Extras (Optional)           │
│ ☑ Hot Stone Massage      R150   │
│                                 │
│ Preferred Massage Pressure *    │
│ ○ Soft  ⦿ Medium  ○ Hard       │
└─────────────────────────────────┘
```

### 6. Validation Rules

**Personalisation Step (Step 1)**
- ✓ Each person MUST have a pressure selected
- ✓ Upsells remain optional
- ✓ "Next" button disabled until all persons have pressure
- ✓ Selections preserved when switching between persons

**Client Details Step (Step 3)**
- ✓ Name, email, phone required
- ✓ Allergies and medical history optional
- ✗ Massage pressure removed (now in Personalisation)

### 7. Data Flow

```
Personalisation Step
  └─> pressureByPerson: { 1: 'medium', 2: 'soft' }
  └─> selectedUpsellsByPerson: { 1: ['upsell-1'], 2: [] }
       │
       v
Payment Step (Display)
  └─> Shows: "Person 1 Pressure: Medium"
  └─> Shows: "Person 2 Pressure: Soft"
       │
       v
API Payload
  └─> customerMassagePressure: pressureByPerson[1]
  └─> (Person 1's preference used as main customer field)
```

## Benefits

1. **Unified Experience**: All personalisation in one place
2. **Better Context**: Pressure preference shown alongside upsells for each person
3. **Clear Validation**: Visual indicators show incomplete selections
4. **Improved Flow**: Related preferences grouped logically
5. **Preserved State**: Switching between persons maintains their selections
6. **Summary View**: Person tabs show at-a-glance status

## Technical Notes

- Pressure stored per person in `pressureByPerson` object
- Person 1's pressure used as `customerMassagePressure` in API payload
- All persons must select pressure before proceeding
- Upsells remain optional and per-person
- Component reuses existing styling patterns for consistency
