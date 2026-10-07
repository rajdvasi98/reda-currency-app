Add-Type -AssemblyName System.Drawing

$size = 1200
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Background
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new($size, $size),
    [System.Drawing.Color]::FromArgb(255, 20, 6, 48), [System.Drawing.Color]::FromArgb(255, 8, 10, 22)
)
$rp = New-Object System.Drawing.Drawing2D.GraphicsPath
$rr = 240
$rp.AddArc(0, 0, $rr*2, $rr*2, 180, 90)
$rp.AddArc($size-$rr*2, 0, $rr*2, $rr*2, 270, 90)
$rp.AddArc($size-$rr*2, $size-$rr*2, $rr*2, $rr*2, 0, 90)
$rp.AddArc(0, $size-$rr*2, $rr*2, $rr*2, 90, 90)
$rp.CloseFigure()
$g.FillPath($bgBrush, $rp)

# Center glow
$g.FillEllipse(
    (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 108, 99, 255))),
    80, 60, 1040, 1040
)

# Globe circle
$gPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 108, 99, 255), 10)
$g.DrawEllipse($gPen, 230, 200, 740, 740)

# Globe meridians
$mPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(38, 108, 99, 255), 6)
$g.DrawEllipse($mPen, 385, 200, 430, 740)
$g.DrawEllipse($mPen, 230, 320, 740, 130)
$g.DrawEllipse($mPen, 230, 460, 740, 130)
$g.DrawEllipse($mPen, 230, 600, 740, 130)

# String format
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment     = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

# Colors
$white  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$purple = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 178, 172, 255))
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 108, 99, 255))

# ── Left panel: big $ symbol ──────────────────────────────────────────────────
$fDollar = New-Object System.Drawing.Font("Georgia", 200, [System.Drawing.FontStyle]::Bold)
$g.DrawString("$", $fDollar, $white, [System.Drawing.RectangleF]::new(60, 290, 420, 280), $fmt)

# ── Right panel: stacked currency codes ──────────────────────────────────────
$fCode = New-Object System.Drawing.Font("Arial", 60, [System.Drawing.FontStyle]::Bold)
$codes = @("EUR", "GBP", "INR", "AED")
$startY = 270
foreach ($code in $codes) {
    $g.DrawString($code, $fCode, $purple, [System.Drawing.RectangleF]::new(730, $startY, 400, 80), $fmt)
    $startY += 110
}

# ── Exchange arrows between panels ───────────────────────────────────────────
$penR = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 108, 99, 255), 20)
$penR.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penR.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($penR, 480, 480, 705, 480)   # → line
$ptR = @(
    [System.Drawing.Point]::new(720, 480),
    [System.Drawing.Point]::new(690, 455),
    [System.Drawing.Point]::new(690, 505)
)
$g.FillPolygon($accent, $ptR)

$penL = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 160, 154, 255), 20)
$penL.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penL.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($penL, 720, 570, 495, 570)   # ← line
$ptL = @(
    [System.Drawing.Point]::new(480, 570),
    [System.Drawing.Point]::new(510, 545),
    [System.Drawing.Point]::new(510, 595)
)
$g.FillPolygon($purple, $ptL)

# ── Divider line ─────────────────────────────────────────────────────────────
$divPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(50, 255, 255, 255), 2)
$g.DrawLine($divPen, 470, 250, 470, 720)

# ── App name at bottom ───────────────────────────────────────────────────────
$fTitle = New-Object System.Drawing.Font("Arial", 76, [System.Drawing.FontStyle]::Bold)
$fSub   = New-Object System.Drawing.Font("Arial", 52, [System.Drawing.FontStyle]::Regular)
$g.DrawString("Multi Currency", $fTitle, $white,  [System.Drawing.RectangleF]::new(0, 870, 1200, 100), $fmt)
$g.DrawString("Converter",      $fSub,   $purple, [System.Drawing.RectangleF]::new(0, 960, 1200, 80),  $fmt)

# Save
$outDir  = Join-Path (Get-Location) "assets"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outPath = Join-Path $outDir "icon-1200.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Saved: $outPath"
