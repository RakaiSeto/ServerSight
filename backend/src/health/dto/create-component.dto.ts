import { HttpMethod } from "@prisma/client"
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from "class-validator"

export class CreateComponentDto {
  @IsString()
  @MaxLength(100)
  label!: string

  @IsUrl({ require_tld: false })
  targetUrl!: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsEnum(HttpMethod)
  requestMethod?: HttpMethod

  @IsOptional()
  @IsString()
  requestPayload?: string
}
