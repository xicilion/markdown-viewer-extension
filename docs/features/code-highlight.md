# Code Highlighting

Markdown Viewer provides syntax highlighting for **100+ programming languages**, making your code blocks beautiful and readable in both preview and exported Word documents.

## Supported Languages

Markdown Viewer supports virtually every programming language you'll encounter:

### Popular Languages

| Language | Identifier |
|----------|------------|
| JavaScript | `javascript`, `js` |
| TypeScript | `typescript`, `ts` |
| Python | `python`, `py` |
| Java | `java` |
| C/C++ | `c`, `cpp`, `c++` |
| C# | `csharp`, `cs` |
| Go | `go`, `golang` |
| Rust | `rust` |
| Ruby | `ruby` |
| PHP | `php` |
| Swift | `swift` |
| Kotlin | `kotlin` |

### Web Technologies

| Language | Identifier |
|----------|------------|
| HTML | `html` |
| CSS | `css` |
| SCSS/Sass | `scss`, `sass` |
| JSON | `json` |
| XML | `xml` |
| YAML | `yaml`, `yml` |
| Markdown | `markdown`, `md` |

### Shell & Config

| Language | Identifier |
|----------|------------|
| Bash | `bash`, `sh` |
| PowerShell | `powershell`, `ps1` |
| Dockerfile | `dockerfile` |
| Makefile | `makefile` |
| TOML | `toml` |
| INI | `ini` |

### Database

| Language | Identifier |
|----------|------------|
| SQL | `sql` |
| PostgreSQL | `pgsql` |
| MySQL | `mysql` |
| GraphQL | `graphql` |

### Others

LaTeX, R, Scala, Haskell, Erlang, Elixir, Clojure, F#, Lua, Perl, Vim script, and many more...

---

## Usage

Specify the language after the opening triple backticks:

````markdown
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```
````

**Result:**

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

---

## Examples

### JavaScript/TypeScript

````markdown
```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
```
````

### Python

````markdown
```python
from dataclasses import dataclass
from typing import List

@dataclass
class Task:
    title: str
    completed: bool = False

def filter_completed(tasks: List[Task]) -> List[Task]:
    return [t for t in tasks if t.completed]
```
````

### SQL

````markdown
```sql
SELECT 
    u.name,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
GROUP BY u.id
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC;
```
````

### Shell

````markdown
```bash
#!/bin/bash

# Deploy script
echo "Starting deployment..."

git pull origin main
npm install
npm run build
pm2 restart app

echo "Deployment complete!"
```
````

---

## Code Themes

Each document theme includes a matching code highlighting style:

| Code Theme | Style | Document Themes |
|------------|-------|-----------------|
| **Light Clean** | Minimal, GitHub-like | Default, Technical, Verdana |
| **Warm Book** | Warm, sepia tones | Palatino, Garamond, Water |
| **Business Contrast** | High contrast | Business, Heiti, Century |
| **Cool Modern** | Cool blues | Swiss, Mixed |
| **Colorful** | Vibrant colors | Typewriter, Playful themes |

The code theme is automatically selected based on your document theme for consistent styling.

---

## Export to Word

Code blocks export to Word with:

- ✅ Syntax highlighting preserved
- ✅ Monospace font (Monaco/Consolas)
- ✅ Background shading
- ✅ Proper indentation

**Note:** Word's display may vary slightly from browser preview, but highlighting is preserved.

---

## Inline Code

For inline code, use single backticks:

```markdown
Use the `console.log()` function to debug.
```

**Result:** Use the `console.log()` function to debug.

Inline code:
- Uses monospace font
- Has subtle background
- Exports correctly to Word

---

## Tips

### Specify the Language

Always specify the language for proper highlighting:

```markdown
✅ Good: ```javascript
❌ Bad:  ```
```

### Long Lines

Very long lines may wrap. Consider:
- Breaking long statements
- Using shorter variable names in examples
- Adding line breaks where syntactically valid

### Large Code Blocks

For very large code blocks:
- Consider extracting key portions
- Add comments to highlight important parts
- Split into multiple smaller blocks with explanations

---

## Language Detection

If you don't specify a language, Markdown Viewer attempts auto-detection. However, specifying the language is recommended for:

- Accurate highlighting
- Faster rendering
- Consistent results

---

## Escaping Code Blocks

To show a code block in a code block (like this documentation does), use four backticks:

`````markdown
````markdown
```javascript
// Your code here
```
````
`````

---

## Common Issues

### Highlighting Not Working?

1. Check the language identifier spelling
2. Ensure there's no space before the language: ` ```javascript` ✅ vs ` ``` javascript` ❌
3. Try a different identifier (e.g., `js` instead of `javascript`)

### Exported Code Looks Different?

Word uses different rendering. The highlighting will be preserved but may look slightly different due to:
- Font rendering
- Color profile differences
- Screen vs print optimization
