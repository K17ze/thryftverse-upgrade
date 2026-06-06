$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\EditListingScreen.tsx'
$content = Get-Content $file -Raw

# Replace all GlassCard opening tags with View
$content = $content -replace '<GlassCard intensity=\{20\} style=\{styles\.glassCard\}>', '<View style={styles.glassCard}>'

# Replace all closing GlassCard tags
$content = $content -replace '</GlassCard>', '</View>'

Set-Content -Path $file -Value $content -NoNewline
