# 🐾 pet-tasks

Beautiful local-first Kanban task manager built to live on your personal GitHub site.

## Features
- Kanban: Todo • Doing • Done
- Drag & drop between columns
- Project tags (seeded with your real projects)
- Priority levels + due dates (overdue = red)
- Search + project filter + "overdue only"
- Full JSON export & import (portable data)
- Keyboard friendly (press `/` to search, `N` for new task)
- 100% client-side (localStorage)

## Deploy to ashoktak.github.io

### Fastest way (no build needed)

1. Copy the file `../pet-tasks.html` (one level up) into your `ashoktak.github.io` repo root.
2. Rename it to `pet-tasks.html` (or `tasks.html`)
3. Commit + push
4. Your task manager is live at:
   https://ashoktak.github.io/pet-tasks.html

You can also put it inside a folder named `pet-tasks/` for https://ashoktak.github.io/pet-tasks/

### Using the Vite version (for development)

```bash
npm install
npm run dev
npm run build     # outputs to ./dist
```

Then copy **everything inside `dist/`** into your GitHub Pages repo under `pet-tasks/`.

Update `base` in `vite.config.ts` if you put it in a subfolder.

## Notes

- Data stays in the browser. Use Export regularly to back up your tasks as JSON.
- This pairs nicely with the parent `pet-projects/` Streamlit app.

Enjoy taking care of your pets one task at a time.
