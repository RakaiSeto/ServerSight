import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { DockerService } from "./docker.service"

@Controller("docker")
@UseGuards(JwtAuthGuard)
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get("containers")
  listContainers() {
    return this.dockerService.listContainers()
  }

  @Get("containers/:id")
  getContainer(@Param("id") id: string) {
    return this.dockerService.getContainer(id)
  }

  @Get("containers/:id/logs")
  getContainerLogs(@Param("id") id: string, @Query("tail") tail?: string) {
    return this.dockerService.getContainerLogs(id, tail)
  }

  @Post("containers/:id/start")
  startContainer(@Param("id") id: string) {
    return this.dockerService.startContainer(id)
  }

  @Post("containers/:id/stop")
  stopContainer(@Param("id") id: string) {
    return this.dockerService.stopContainer(id)
  }
}
