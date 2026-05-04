import { Controller, Get, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { SystemService } from "./system.service"

@Controller("system")
@UseGuards(JwtAuthGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get("stats")
  getStats() {
    return this.systemService.getStats()
  }

  @Get("history")
  getHistory(@Query("range") range?: string, @Query("step") step?: string) {
    return this.systemService.getHistory(range, step)
  }
}
