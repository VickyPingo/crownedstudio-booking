# Website Integration Guide

## Two Ways to Integrate Booking

You can integrate the booking system into your website using either **Direct URL Links** or **JavaScript Hook**.

---

## Method 1: Direct URL Links (Recommended for External Websites)

This is the simplest method - just link to the booking page with the service slug.

### URL Format

```
https://crownedstudio-booking.vercel.app/book/{service-slug}
```

### Example Links

```html
<!-- Simple HTML link -->
<a href="https://crownedstudio-booking.vercel.app/book/complete-body-care">
  Book Complete Body Care
</a>

<!-- With styling -->
<a
  href="https://crownedstudio-booking.vercel.app/book/complete-body-care"
  style="background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;"
>
  Book Now
</a>

<!-- Button that navigates -->
<button onclick="window.location.href='https://crownedstudio-booking.vercel.app/book/complete-body-care'">
  Book Complete Body Care
</button>
```

### How It Works

1. User clicks the link
2. Browser navigates to `/book/complete-body-care`
3. Page loads with booking modal automatically opened
4. Service "Complete Body Care" is pre-selected
5. User completes the booking flow

### Error Handling

- If the slug doesn't match any service, user sees "Service Not Found" with a link to view all services
- If there's a database error, user sees a clear error message

---

## Method 2: JavaScript Hook (For React/Next.js Integration)

If you're building within the same Next.js app, use the hook for seamless modal integration.

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

---

## Service Slug Reference

Current available service:
- `complete-body-care` - Complete Body Care

---

## Testing

### Test the Direct URL

Visit this URL in your browser:
```
https://crownedstudio-booking.vercel.app/book/complete-body-care
```

Expected behavior:
1. Page loads with "Book Complete Body Care" heading
2. Booking modal opens automatically
3. "Complete Body Care" service is pre-selected
4. You can proceed through all booking steps

### Test Invalid Slug

Visit this URL:
```
https://crownedstudio-booking.vercel.app/book/invalid-service
```

Expected behavior:
1. Page shows "Service Not Found" message
2. Link to view all services is displayed

---

## Notes

- The service must exist in your Supabase `services` table with matching slug
- The service must have `active = true`
- All payment logic, database operations, and booking flow remain unchanged
- Both methods use the same underlying booking system
