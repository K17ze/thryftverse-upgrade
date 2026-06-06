$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\AccountSettingsScreen.tsx'
$content = Get-Content $file -Raw

# Replace all GlassCard opening tags (with or without intensity)
$content = $content -replace '<GlassCard intensity=\{40\} style=\{styles\.editModalCard\}>', '<View style={styles.editModalCard}>'
$content = $content -replace '<GlassCard intensity=\{35\} style=\{\{ marginHorizontal: 0, marginBottom: 0 \}\}>', '<View style={{ marginHorizontal: 0, marginBottom: 0, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg }}>'

# Replace all closing GlassCard tags
$content = $content -replace '</GlassCard>', '</View>'

Set-Content -Path $file -Value $content -NoNewline
