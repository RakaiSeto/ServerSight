import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { AuthModule } from "./auth/auth.module"
import { PrismaModule } from "./prisma/prisma.module"
import { SystemModule } from "./system/system.module"
import { DockerModule } from "./docker/docker.module"
import { HealthModule } from "./health/health.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    SystemModule,
    DockerModule,
    HealthModule,
  ],
})
export class AppModule {}
