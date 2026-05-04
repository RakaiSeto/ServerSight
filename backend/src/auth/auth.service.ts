import { Injectable, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import bcrypt from "bcrypt"
import { PrismaService } from "../prisma/prisma.service"
import { LoginDto } from "./dto/login.dto"

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(payload: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: payload.email } })

    if (!user) {
      throw new UnauthorizedException("Invalid credentials")
    }

    const isValid = await bcrypt.compare(payload.password, user.passwordHash)

    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials")
    }

    return {
      accessToken: await this.jwtService.signAsync({ sub: user.id, email: user.email }),
    }
  }
}
