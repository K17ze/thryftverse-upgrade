$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\SellScreenV2.tsx'
$content = Get-Content $file -Raw

# Remove imports
$content = $content -replace "import { GlassCard } from '../components/ui/GlassSurface';\r?\n", ""
$content = $content -replace "import { GlowSurface } from '../components/ui/GlowSurface';\r?\n", ""

# Replace mediaEmptyCard (has contentStyle prop)
$content = $content -replace '<GlassCard style=\{styles\.mediaEmptyCard\} contentStyle=\{styles\.mediaEmptyInner\}>', '<View style={[styles.mediaEmptyCard, styles.mediaEmptyInner]}>'

# Replace all other simple GlassCard tags
$content = $content -replace '<GlassCard style=\{styles\.([a-zA-Z]+)\}>', '<View style={styles.$1}>'

# Replace all closing GlassCard tags
$content = $content -replace '</GlassCard>', '</View>'

# Replace GlowSurface
$content = $content -replace '<GlowSurface intensity=\{0\.08\} color=\{Colors\.brand\} style=\{styles\.floatingCtaGlow\}>', '<View style={styles.floatingCtaGlow}>'
$content = $content -replace '</GlowSurface>', '</View>'

Set-Content -Path $file -Value $content -NoNewline
