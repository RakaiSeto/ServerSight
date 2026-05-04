import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from "class-validator"

export class CreateWebsiteDto {
  @IsString()
  @MaxLength(100)
  name!: string

  @IsUrl({ require_tld: false })
  url!: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
