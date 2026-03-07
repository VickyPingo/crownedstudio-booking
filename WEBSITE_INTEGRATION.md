# Website Integration Guide

## How to Add a "Book Now" Button to Your Website

You can now open the booking modal from anywhere on your website using just a service slug.

### Step 1: Import the Hook

```tsx
'use client'

import { useBookService } from '@/hooks/useBookService'
```

### Step 2: Use the Hook in Your Component

```tsx
export function MyWebsitePage() {
  const { bookService } = useBookService()

  return (
    <div>
      <h1>Complete Body Care</h1>
      <p>Our premium full-body treatment</p>

      <button onClick={() => bookService('complete-body-care')}>
        Book Now
      </button>
    </div>
  )
}
```

### Complete Example

```tsx
'use client'

import { useBookService } from '@/hooks/useBookService'

export function CompleteBodyCarePage() {
  const { bookService } = useBookService()

  return (
    <div className="container">
      <div className="hero-section">
        <h1>Complete Body Care</h1>
        <p>Experience our signature full-body treatment</p>

        <button
          onClick={() => bookService('complete-body-care')}
          className="book-button"
        >
          Book Complete Body Care
        </button>
      </div>

      <div className="details">
        {/* Your service description, images, etc. */}
      </div>
    </div>
  )
}
```

### How It Works

1. **Button Click**: User clicks "Book Now" with slug `'complete-body-care'`
2. **Slug Lookup**: System finds the service from the loaded services list
3. **Modal Opens**: Booking modal opens with "Complete Body Care" already selected
4. **User Continues**: User proceeds through the normal booking flow

### Service Slug Reference

Current available service:
- `complete-body-care` - Complete Body Care

### Notes

- The service must exist in your Supabase `services` table with matching slug
- The service must have `active = true`
- Services are loaded on page load, so the slug lookup is instant
- If slug doesn't match any service, modal won't open
