param([Parameter(Mandatory = $true)][string]$RutaRaiz)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath $RutaRaiz).Path
$relativePaths = & git -C $repositoryRoot ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el contenido del repositorio Git.' }

$entries = @(
    $relativePaths | Sort-Object -Unique | Where-Object { $_ -ne 'MANIFIESTO_SHA256.json' } | ForEach-Object {
        $relativePath = $_
        $target = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $relativePath))
        if (-not $target.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Ruta fuera del repositorio.'
        }
        $item = Get-Item -LiteralPath $target
        [ordered]@{
            path = $relativePath
            bytes = $item.Length
            sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        }
    }
)

$manifest = [ordered]@{
    formatVersion = 1
    createdAtUtc = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    files = $entries
}
$manifestPath = Join-Path $repositoryRoot 'MANIFIESTO_SHA256.json'
$lineFeed = [string][char]10
$json = (($manifest | ConvertTo-Json -Depth 6) -replace '\r\n', $lineFeed) + $lineFeed
[IO.File]::WriteAllText($manifestPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Output ('Manifiesto actualizado: ' + $entries.Count + ' archivos.')
