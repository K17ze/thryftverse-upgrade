cd 'c:\Users\ASUS\Desktop\thryftverse\frontend\src'
$files = @('screens\InboxScreen.tsx','screens\ChatScreen.tsx','screens\SettingsScreenV2.tsx','screens\HomeScreen.tsx','screens\BrowseScreen.tsx','screens\ItemDetailScreen.tsx','screens\CreatePosterScreenV2.tsx','components\chat\ChatTopBar.tsx','components\chat\ChatComposerBar.tsx','components\chat\ChatBubbleV2.tsx','components\chat\MarketplaceChatCard.tsx','components\chat\ChatActionSheet.tsx','components\settings\SettingsPage.tsx','components\settings\SettingsSection.tsx','components\settings\SettingsRow.tsx')
foreach ($f in $files) {
  $r = Select-String -Path $f -Pattern 'BlurView|GlassCard|GlowSurface' -SimpleMatch
  if ($r) {
    Write-Host "$f HAS HITS"
    $r | ForEach-Object { Write-Host "  $($_.Line.Trim())" }
  }
}
Write-Host "Done"
