$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\HomeScreen.tsx'
$content = Get-Content $file -Raw

# Replace StaggeredItem opening tags with View
$content = $content -replace '<StaggeredItem key=\{item\.id\} index=\{originalIndex\} animation="fadeDown" staggerMs=\{40\}>', '<View key={item.id}>'

# Replace StaggeredItem closing tags
$content = $content -replace '</StaggeredItem>', '</View>'

# Remove StaggeredItem import
$content = $content -replace "import \{ StaggeredItem \} from '\.\./components/StaggeredGridEntrance';\r?\n", ''

Set-Content -Path $file -Value $content -NoNewline
