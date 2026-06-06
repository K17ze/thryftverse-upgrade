$file = 'c:\Users\ASUS\Desktop\thryftverse\frontend\src\screens\CreatePosterScreenV2.tsx'
$content = Get-Content $file -Raw

# 1. Remove applyFilterStyle from Image in editing phase
$content = $content -replace 'style=\{\[StyleSheet\.absoluteFill, applyFilterStyle\(\)\]\}', 'style={StyleSheet.absoluteFill}'

# 2. Remove filter toolbar entirely
$content = $content -replace '\r?\n        <View style=\{styles\.toolbar\}>\r?\n          <Text style=\{styles\.toolbarLabel\}>Filter</Text>\r?\n          <FlatList\r?\n            horizontal\r?\n            data=\{FILTERS\}\r?\n            keyExtractor=\{\(f\) => f\.key\}\r?\n            showsHorizontalScrollIndicator=\{false\}\r?\n            contentContainerStyle=\{\{ gap: Space\.sm \}\}\r?\n            renderItem=\{\(\{ item \}\) => \(\r?\n              <Pressable onPress=\{\(\) => \{ setFilter\(item\.key as any\); setHasChanges\(true\); \}\}>\r?\n                <View style=\{\[styles\.filterChip, filter === item\.key && styles\.filterChipActive\]\}>\r?\n                  <Text style=\{\[styles\.filterChipText, filter === item\.key && styles\.filterChipTextActive\]\}>\{item\.label\}</Text>\r?\n                </View>\r?\n              </Pressable>\r?\n            \)\}\r?\n          />\r?\n        </View>', ''

# 3. Replace fake save with honest save
$content = $content -replace "show\('Poster saved!', 'success'\);", "show('Draft saved locally', 'info');"

# 4. Hide Text action button - comment out or remove
$content = $content -replace '<ActionButton icon="text-outline" label="Text" onPress=\{\(\) => \{ setPhase\(''editing''\); setHasChanges\(true\); \}\} />', '<!-- Text mode not yet built -->'
# Actually, just remove the line
$content = $content -replace '\r?\n            <ActionButton icon="text-outline" label="Text" onPress=\{\(\) => \{ setPhase\(''editing''\); setHasChanges\(true\); \}\} />', ''

# 5. Remove FILTERS constant at bottom
$content = $content -replace '\r?\nconst FILTERS = \[\r?\n  \{ key: ''normal'', label: ''Normal'' \},\r?\n  \{ key: ''bw'', label: ''B&W'' \},\r?\n  \{ key: ''warm'', label: ''Warm'' \},\r?\n\];', ''

Set-Content -Path $file -Value $content -NoNewline
