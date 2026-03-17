# Pregnancy Question Implementation

## Overview
Added a required pregnancy question to the booking flow with conditional policy display and full admin visibility.

## Changes Summary

### 1. Database Schema

**Migration**: `add_pregnancy_information`

Added to bookings table:
- `is_pregnant` (boolean, NOT NULL, default: false): Indicates whether client is pregnant at time of booking
- Indexed for efficient querying of pregnant clients
- Per-booking field (not on customer) as pregnancy status changes between visits

### 2. Booking Flow Updates

#### Client Details Step - Health Information Section

**New Required Question**:
- **Label**: "Are you pregnant?" (with required asterisk)
- **Input Type**: Toggle buttons (Yes/No)
- **Styling**:
  - Large touch-friendly buttons
  - Selected state: Black background with white text
  - Unselected state: White background with gray border
  - Consistent with existing form design

**Validation**:
- Must be answered before proceeding to payment
- Shows red error message if not answered: "Please answer this question to continue"
- Prevents "Next" button from working until answered

#### Conditional Policy Display

When user selects **"Yes"**:
- Immediately displays pregnancy-safe massage policy
- **Styling**: Blue informational card with icon
- **Layout**: Information icon on left, content on right
- **Clearly formatted** with proper spacing and emphasis

**Policy Text Displayed**:
```
Pregnancy Safe Massage Policy

Please note that for all pregnant clients, the full body massage
included in any package will be substituted with a pregnancy-safe massage.

This massage includes gentle, light-pressure techniques only and
focuses on the back, neck, shoulders, scalp, hands, and feet.

For safety reasons, no deep pressure, abdominal work, or hot
treatments are permitted during pregnancy.

We only accommodate clients who are between 3 and 6 months pregnant.
```

When user selects **"No"**:
- Policy text is hidden
- Clean, minimal display

**State Persistence**:
- Answer is preserved when navigating back and forth in the modal
- Policy visibility maintained based on selection

### 3. Type Definitions

#### `types/booking.ts`

```typescript
export interface BookingFormData {
  // ... existing fields
  clientIsPregnant: boolean | null  // null = unanswered
}

export interface CreateBookingPayload {
  // ... existing fields
  customerIsPregnant: boolean  // Sent to API
}
```

### 4. Data Flow

1. **User Selection**: Client selects Yes/No in booking form
2. **Validation**: Form validates pregnancy question is answered before proceeding
3. **API Payload**: Sent as `customerIsPregnant` boolean (defaults to false if null)
4. **Database Storage**: Saved as `is_pregnant` on bookings table
5. **Admin Display**: Visible in booking detail drawer

### 5. Admin Dashboard Updates

#### Booking Detail Drawer - Client Information Section

Added **Pregnancy Status** field:

**When Pregnant (is_pregnant = true)**:
- Pink badge: "Pregnant"
- Helper text: "Pregnancy-safe massage required"
- Clear visual indicator for staff

**When Not Pregnant (is_pregnant = false)**:
- Simple text: "Not pregnant"
- Low-emphasis display

**Location**:
- Displayed in "Client Information" section
- After Medical History field
- Before Massage Preferences section

### 6. UI/UX Details

#### Form Design
- **Question Placement**: Last item in Health Information section
- **Button Layout**: Side-by-side Yes/No buttons, equal width
- **Accessibility**: Clear labels, touch-friendly targets
- **Visual Hierarchy**: Red asterisk for required, clear button states

#### Policy Card Design
- **Background**: Soft blue (bg-blue-50)
- **Border**: Blue border (border-blue-200)
- **Icon**: Information circle icon in blue
- **Text Color**: Dark blue for readability
- **Spacing**: Generous padding and line spacing for easy reading
- **Emphasis**: Bold text for the critical "3-6 months" requirement

#### Admin Display
- **Badge Style**: Pink background for pregnant status (matches health/medical theme)
- **Information Density**: Compact but clear
- **Context**: Helper text reminds staff of service modification needed

### 7. Validation Rules

**Booking Flow**:
1. Question must be answered (cannot be null)
2. Cannot proceed to Payment step without answering
3. Answer preserved when navigating between steps

**Data Storage**:
- Defaults to `false` if somehow null reaches API
- Stored as NOT NULL boolean in database
- Always has a definitive true/false value

### 8. Safety & Business Rules

**Policy Requirements** (displayed to pregnant clients):
- ✓ Pregnancy-safe massage substitution
- ✓ Light pressure techniques only
- ✓ Focus areas: back, neck, shoulders, scalp, hands, feet
- ✓ No deep pressure allowed
- ✓ No abdominal work
- ✓ No hot treatments
- ✓ **Only 3-6 months pregnant accepted**

### 9. Complete Data Capture

For each booking with pregnant client:

**User Sees**:
- Clear Yes/No question
- Full pregnancy-safe massage policy
- 3-6 months requirement

**System Stores**:
- `is_pregnant: true` on booking record
- All other health information (allergies, medical history)
- Date of birth (for age verification if needed)

**Staff Sees**:
- "Pregnant" badge in booking details
- Reminder: "Pregnancy-safe massage required"
- All client health information together

### 10. Testing Checklist

- [x] TypeScript compiles without errors
- [x] Pregnancy question appears in Client Details step
- [x] Question is required (shows error when unanswered)
- [x] "No" selection hides policy text
- [x] "Yes" selection shows policy text
- [x] Policy text is clearly formatted and readable
- [x] Selection persists when navigating back/forth
- [x] Validation prevents proceeding without answer
- [x] API saves pregnancy status to database
- [x] Database migration applied successfully
- [x] Admin booking drawer shows pregnancy status
- [x] Pregnant status displayed with badge and helper text
- [x] All types updated correctly

### 11. Migration Details

**File**: `add_pregnancy_information.sql`

**Changes**:
- Adds `is_pregnant` boolean column to bookings table
- Sets default to `false` for backwards compatibility
- Column is NOT NULL to ensure clear status
- Creates partial index on `is_pregnant = true` for efficient querying
- Conditional logic ensures safe application if tables don't exist yet

**Index Strategy**:
- Partial index only on `true` values
- Reduces index size
- Optimizes queries for pregnant clients
- Most bookings are `false`, so partial index is efficient

### 12. User Experience Flow

1. **Client Details Step**:
   - User fills name, email, phone, date of birth
   - User sees "Health Information" section
   - User answers allergies and medical history (optional)
   - **User must answer pregnancy question (required)**

2. **Selecting "No"**:
   - Toggle highlights "No" button
   - Policy text remains hidden
   - Can proceed to payment

3. **Selecting "Yes"**:
   - Toggle highlights "Yes" button
   - Blue policy card appears immediately below
   - User reads pregnancy-safe massage policy
   - User sees 3-6 months requirement
   - Can proceed to payment with full knowledge

4. **Payment Summary**:
   - Shows all client details
   - Pregnancy status not displayed in summary (internal use only)

5. **Admin View**:
   - Staff opens booking detail drawer
   - Sees pregnancy status clearly marked
   - Knows to provide pregnancy-safe massage
   - All health information in one place

### 13. Future Enhancements

Potential improvements:
- Pregnancy month/trimester tracking
- Automatic service modification suggestions
- Pregnancy-specific consent form
- Integration with liability waiver
- Email notification to staff for pregnant clients
- Pregnancy massage preference storage
- Historical pregnancy booking tracking

### 14. Known Behaviors

1. **Default Value**: If pregnancy answer somehow reaches API as null, defaults to `false`
2. **Not on Customer Profile**: Pregnancy is per-booking, not stored on customer record
3. **Policy Display Only**: Policy shown for information; no automatic service modification
4. **Visual Indicator**: Pink badge in admin deliberately stands out for safety
5. **Required Field**: Unlike allergies/medical history, pregnancy question cannot be skipped

## Implementation Complete

All functionality has been implemented and tested:
- ✅ Required pregnancy question in booking flow
- ✅ Conditional policy display on "Yes" selection
- ✅ Policy text clearly formatted and readable
- ✅ Database schema updated with migration
- ✅ Data persistence working correctly
- ✅ Admin visibility with clear indicators
- ✅ TypeScript types updated
- ✅ Validation and state management working
- ✅ Backwards compatible with existing bookings
