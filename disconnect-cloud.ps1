# Close the 8188 tunnel only. Leave Shotfield running.
$n = 0
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match "^(ssh|plink)\.exe$" -and $_.CommandLine -match "8188:127.0.0.1"
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  $n++
}
if ($n) {
  Write-Host "Cloud tunnel closed. Close the start.bat window if you also want to stop Shotfield."
} else {
  Write-Host "No 8188 tunnel found."
}
