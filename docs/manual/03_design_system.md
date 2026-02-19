# 03. Design System & UI Kit

Itera OS employs a strict **Semantic Design System**.
Instead of hardcoding colors (e.g., `#000000`, `bg-gray-900`), we use **Semantic Tokens** (e.g., `bg-app`, `text-main`) that dynamically adapt to the user's active theme.

## The UI Kit (`system/lib/ui.js`)

All guest applications MUST include the UI Kit library in their `<head>` section.

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="../system/lib/ui.js"></script>
```

This library automatically injects:
1.  **Tailwind Configuration**: Maps semantic tokens to CSS variables.
2.  **Global Styles**: Sets the default font (`Inter`) and scrollbar styling.
3.  **AppUI Helpers**: Utilities for navigation.

## Semantic Tokens Reference

Use these Tailwind classes to ensure your app looks perfect in both Dark and Light themes.

### 1. Backgrounds (`bg-*`)

| Class | Usage | Description |
| :--- | :--- | :--- |
| `bg-app` | Page Root | The lowest layer background (Body). |
| `bg-panel` | Containers | Sidebars, headers, large sections. |
| `bg-card` | Elements | Individual items, cards, input fields. |
| `bg-hover` | Interaction | Hover states for clickable items. |
| `bg-overlay` | Modal/Tint | Used with opacity (e.g. `bg-overlay/50`) for backdrops. |

### 2. Text (`text-*`)

| Class | Usage | Description |
| :--- | :--- | :--- |
| `text-text-main` | Primary Content | Headings, main body text. |
| `text-text-muted` | Metadata | Timestamps, labels, secondary info. |
| `text-text-inverted`| Contrast | Text on accent backgrounds (e.g. on `bg-primary`). |
| `text-system` | System Info | Non-urgent system messages (usually blue). |

### 3. Borders (`border-*`)

| Class | Usage | Description |
| :--- | :--- | :--- |
| `border-border-main` | Default | Standard dividers and card borders. |
| `border-border-highlight`| Focus | Active inputs or selected items. |

### 4. Accents (Color)

These colors convey meaning.

| Token | Class (Text/Bg/Border) | Usage |
| :--- | :--- | :--- |
| **Primary** | `*-primary` | Main actions, active states, branding. |
| **Success** | `*-success` | Completion, safety, "Good" status. |
| **Warning** | `*-warning` | Caution, "Pending" status. |
| **Error** | `*-error` | Destructive actions, alerts, "High Priority". |

## Implementation Guide

### ❌ DO NOT DO THIS (Hardcoded)
```html
<!-- Bad: Will break in Light Mode or Custom Themes -->
<body class="bg-gray-900 text-white">
    <div class="bg-gray-800 border-gray-700">
        <button class="bg-blue-600">Save</button>
    </div>
</body>
```

### ✅ DO THIS (Semantic)
```html
<!-- Good: Adapts to any theme automatically -->
<body class="bg-app text-text-main">
    <div class="bg-panel border-border-main">
        <button class="bg-primary text-text-inverted hover:bg-primary/90">Save</button>
    </div>
</body>
```

## Typography & Icons

*   **Font**: The system font is set to `Inter` by default via `ui.js`.
*   **Icons**: We recommend using standard SVG icons (like Heroicons).
    *   Icon color should generally use `text-text-muted` for inactive states and `text-text-main` or `text-primary` for active states.

---
**Next Step:** Proceed to [04_development.md](04_development.md) to learn how to build apps using these tokens.