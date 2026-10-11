param([Parameter(Mandatory = $true)][string]$RutaRaiz)
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $RutaRaiz).Path
$manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'MANIFIESTO_SHA256.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.formatVersion -ne 1) { throw 'Version de manifiesto desconocida.' }
foreach ($entry in $manifest.files) {
    $target = [IO.Path]::GetFullPath((Join-Path $packageRoot $entry.path))
    if (-not $target.StartsWith($packageRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera del paquete.' }
    $item = Get-Item -LiteralPath $target
    if ($item.Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256) {
        throw ('Contenido diferente: ' + $entry.path)
    }
}
Write-Output ('Manifiesto correcto: ' + @($manifest.files).Count + ' archivos.')
