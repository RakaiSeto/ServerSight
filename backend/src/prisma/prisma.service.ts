import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Prisma, PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions>
  implements OnModuleInit, OnModuleDestroy 
{
  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set")
    }

    const adapter = new PrismaPg({ connectionString })

    super({
      adapter,
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
