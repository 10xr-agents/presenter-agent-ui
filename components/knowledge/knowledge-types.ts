export type AssetType = "file" | "documentation"

export interface FileAsset {
  id: string
  type: "file"
  file: File
  name: string
  size: number
}

export interface UrlAsset {
  id: string
  type: "documentation"
  url: string
  name: string
}

export type Asset = FileAsset | UrlAsset
