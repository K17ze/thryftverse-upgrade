$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\ChatScreen.tsx'
$content = Get-Content $file -Raw

# 1. Remove unused animation imports from the Reanimated block
$content = $content -replace "import Reanimated, \{\r?\n\r?\n  SlideInRight,\r?\n\r?\n  SlideInLeft,\r?\n\r?\n  ZoomIn,\r?\n\r?\n  FadeIn,\r?\n\r?\n  Layout,\r?\n\r?\n\} from 'react-native-reanimated';", "import Reanimated from 'react-native-reanimated';"

# 2. Remove layoutAnimation variable
$content = $content -replace "    const layoutAnimation = reducedMotionEnabled \? undefined : Layout\.springify\(\);\r?\n\r?\n", ""

# 3. Remove entering={reducedMotionEnabled ? undefined : FadeIn} and layout={layoutAnimation}
#    from date separators
$content = $content -replace "          entering=\{reducedMotionEnabled \? undefined : FadeIn\}\r?\n\r?\n          layout=\{layoutAnimation\}", ""

# 4. Remove entering={reducedMotionEnabled ? undefined : FadeIn.delay(200)} and layout={layoutAnimation}
#    from status wraps
$content = $content -replace "          entering=\{reducedMotionEnabled \? undefined : FadeIn\.delay\(200\)\}\r?\n\r?\n          layout=\{layoutAnimation\}", ""

# 5. Remove layout={layoutAnimation} from message rows (there are two occurrences)
$content = $content -replace "          layout=\{layoutAnimation\}\r?\n\r?\n          style=\{\[styles\.msgRow", "          style={[styles.msgRow"
$content = $content -replace "          layout=\{layoutAnimation\}\r?\n\r?\n          style=\{\[styles\.msgRow", "          style={[styles.msgRow"

Set-Content -Path $file -Value $content -NoNewline
