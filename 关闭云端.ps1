# 只关 8188 隧道，不动镜场画布。
$n = 0
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match "^(ssh|plink)\.exe$" -and $_.CommandLine -match "8188:127.0.0.1"
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  $n++
}
if ($n) {
  Write-Host "云端隧道已关掉。画布还开着的话请自己关「启动镜场」窗口。"
} else {
  Write-Host "没找到 8188 隧道。"
}
