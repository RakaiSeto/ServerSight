import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { CreateComponentDto } from "./dto/create-component.dto"
import { CreateWebsiteDto } from "./dto/create-website.dto"
import { UpdateComponentDto } from "./dto/update-component.dto"
import { UpdateWebsiteDto } from "./dto/update-website.dto"
import { HealthService } from "./health.service"

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health/websites")
  listPublic() {
    return this.healthService.listPublic()
  }

  @Get("health/websites/hourly")
  listPublicHourly(@Query("hours") hours?: string) {
    return this.healthService.listPublicHourly(Number(hours || 168))
  }

  @UseGuards(JwtAuthGuard)
  @Get("admin/health/websites")
  listAdmin() {
    return this.healthService.listAdmin()
  }

  @UseGuards(JwtAuthGuard)
  @Post("admin/health/websites")
  createWebsite(@Body() body: CreateWebsiteDto) {
    return this.healthService.create(body)
  }

  @UseGuards(JwtAuthGuard)
  @Put("admin/health/websites/:id")
  updateWebsite(@Param("id") id: string, @Body() body: UpdateWebsiteDto) {
    return this.healthService.update(id, body)
  }

  @UseGuards(JwtAuthGuard)
  @Delete("admin/health/websites/:id")
  deleteWebsite(@Param("id") id: string) {
    return this.healthService.softDelete(id)
  }

  @UseGuards(JwtAuthGuard)
  @Post("admin/health/websites/:websiteId/components")
  createComponent(@Param("websiteId") websiteId: string, @Body() body: CreateComponentDto) {
    return this.healthService.createComponent(websiteId, body)
  }

  @UseGuards(JwtAuthGuard)
  @Put("admin/health/components/:componentId")
  updateComponent(@Param("componentId") componentId: string, @Body() body: UpdateComponentDto) {
    return this.healthService.updateComponent(componentId, body)
  }

  @UseGuards(JwtAuthGuard)
  @Delete("admin/health/components/:componentId")
  deleteComponent(@Param("componentId") componentId: string) {
    return this.healthService.deleteComponent(componentId)
  }
}
