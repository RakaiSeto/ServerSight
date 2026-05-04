import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from "class-validator"

export class UpdateWebsiteDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
