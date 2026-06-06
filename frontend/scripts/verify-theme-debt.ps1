$files = @(
  'src/screens/InboxScreen.tsx',
  'src/screens/ChatScreen.tsx',
  'src/screens/SettingsScreenV2.tsx',
  'src/screens/HomeScreen.tsx',
  'src/screens/BrowseScreen.tsx',
  'src/screens/ItemDetailScreen.tsx',
  'src/screens/CreatePosterScreenV2.tsx'
)
cd 'c:\Users\ASUS\Desktop\thryftverse\frontend'
foreach ($f in $files) {
  $r = Select-String -Path $f -Pattern 'ActiveTheme|IS_LIGHT' -SimpleMatch
  if ($r) {
    Write-Host "$f has hits"
    $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" }
  } else {
    Write-Host "$f clean"
  }
}
