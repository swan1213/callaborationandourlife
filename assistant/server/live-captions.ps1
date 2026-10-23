# Reads the text of Windows 11 Live Captions through UI Automation and prints one JSON line
# whenever it changes. Started and stopped by server/liveCaptions.cjs.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Send($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

if (-not (Get-Process LiveCaptions -ErrorAction SilentlyContinue)) {
  Start-Process "$env:WINDIR\System32\LiveCaptions.exe"
}

$textCondition = New-Object Windows.Automation.PropertyCondition(
  [Windows.Automation.AutomationElement]::AutomationIdProperty, 'CaptionsTextBlock')
$textElement = $null
$last = $null
$status = ''

while ($true) {
  try {
    if (-not $textElement) {
      $proc = Get-Process LiveCaptions -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if ($proc) {
        $window = [Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
        $textElement = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $textCondition)
      }
      if (-not $textElement) {
        if ($status -ne 'waiting') { $status = 'waiting'; Send @{ status = 'waiting' } }
        Start-Sleep -Milliseconds 500
        continue
      }
      $status = 'connected'
      Send @{ status = 'connected' }
    }
    $text = $textElement.Current.Name
    if ($text -ne $last) {
      $last = $text
      Send @{ text = $text }
    }
  } catch {
    # Live Captions was closed or its window was rebuilt: find it again.
    $textElement = $null
  }
  Start-Sleep -Milliseconds 50
}
