import { Controller, Get, Inject, Module, Query } from "@nestjs/common";
import { CatalogService } from "./catalog.service.js";

@Controller("api/catalog")
class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get("sets") sets() {
    return this.catalog.sets();
  }
  @Get("cards") cards(
    @Query("q") query = "",
    @Query("status") status?: "unimplemented" | "implemented",
  ) {
    return this.catalog.cards(query, status);
  }
  @Get("names") names(@Query("q") query = "") {
    return this.catalog.names(query);
  }
}
@Module({
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
