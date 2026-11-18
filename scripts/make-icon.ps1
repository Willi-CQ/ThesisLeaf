# Erzeugt build/icon.png (512px) und build/icon.ico aus einer einfachen Blatt-Grafik.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$buildDir = Join-Path $root "build"
New-Item -ItemType Directory -Force $buildDir | Out-Null

function Draw-Icon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 48.0
  $radius = 10 * $s
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($size - $d, 0, $d, $d, 270, 90)
  $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $path.AddArc(0, $size - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 25, 150, 66)), ([System.Drawing.Color]::FromArgb(255, 12, 100, 40)), 60
  $g.FillPath($brush, $path)

  # Blatt
  $leaf = New-Object System.Drawing.Drawing2D.GraphicsPath
  $leaf.AddBezier(39 * $s, 8 * $s, 22 * $s, 8 * $s, 10 * $s, 20 * $s, 10 * $s, 34 * $s)
  $leaf.AddBezier(10 * $s, 34 * $s, 10 * $s, 40 * $s, 14 * $s, 44 * $s, 20 * $s, 44 * $s)
  $leaf.AddBezier(20 * $s, 44 * $s, 34 * $s, 44 * $s, 46 * $s, 30 * $s, 46 * $s, 15 * $s)
  $leaf.AddBezier(46 * $s, 15 * $s, 46 * $s, 12 * $s, 44 * $s, 8 * $s, 39 * $s, 8 * $s)
  $leaf.CloseFigure()
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $g.FillPath($white, $leaf)

  # Blattader
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 25, 140, 62)), (2.6 * $s)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawBezier($pen, 18 * $s, 36 * $s, 24 * $s, 30 * $s, 30 * $s, 22 * $s, 36 * $s, 12 * $s)

  $g.Dispose()
  return $bmp
}

$png = Draw-Icon 512
$png.Save((Join-Path $buildDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$png.Dispose()

# ICO mit mehreren Größen (PNG-komprimierte Einträge)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($sz in $sizes) {
  $b = Draw-Icon $sz
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $images += ,@($sz, $ms.ToArray())
  $b.Dispose()
}
$icoPath = Join-Path $buildDir "icon.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$images.Count)
$offset = 6 + 16 * $images.Count
foreach ($img in $images) {
  $sz = $img[0]; $bytes = $img[1]
  $dim = if ($sz -ge 256) { 0 } else { $sz }
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim); $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$bytes.Length); $bw.Write([UInt32]$offset)
  $offset += $bytes.Length
}
foreach ($img in $images) { $bw.Write($img[1]) }
$bw.Flush(); $fs.Close()
Write-Output "Icon erzeugt: $buildDir\icon.png, $icoPath"
