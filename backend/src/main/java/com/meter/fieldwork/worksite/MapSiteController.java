package com.meter.fieldwork.worksite;

import com.meter.fieldwork.global.ApiResult;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
public class MapSiteController {
  private final NamedParameterJdbcTemplate db;

  public MapSiteController(NamedParameterJdbcTemplate db) {
    this.db = db;
  }

  @GetMapping("/api/map-clusters")
  ApiResult<?> clusters(
      @RequestParam double south,
      @RequestParam double north,
      @RequestParam double west,
      @RequestParam double east,
      @RequestParam int zoom) {
    if (!Double.isFinite(south)
        || !Double.isFinite(north)
        || !Double.isFinite(west)
        || !Double.isFinite(east)
        || south < -90
        || north > 90
        || west < -180
        || east > 180
        || south >= north
        || west >= east
        || zoom < 1
        || zoom > 22) throw new IllegalArgumentException("지도 영역을 확인하세요.");
    var clusters =
        db.queryForList(
            """
            select floor((longitude-:west)/:dx)::int as x, floor((latitude-:south)/:dy)::int as y,
              count(*) as count,avg(latitude) as latitude,avg(longitude) as longitude
            from worksites where latitude between :south and :north and longitude between :west and :east
              and not(latitude=0 and longitude=0)
            group by x,y order by x,y
            """,
            Map.of(
                "south",
                south,
                "north",
                north,
                "west",
                west,
                "east",
                east,
                "dx",
                (east - west) / 6.0,
                "dy",
                (north - south) / 6.0));
    long total = clusters.stream().mapToLong(row -> ((Number) row.get("count")).longValue()).sum();
    return ApiResult.ok(Map.of("clusters", clusters, "total", total));
  }

  @GetMapping("/api/map-sites")
  ApiResult<?> markers(
      @RequestParam double south,
      @RequestParam double north,
      @RequestParam double west,
      @RequestParam double east,
      @RequestParam int zoom) {
    if (!Double.isFinite(south)
        || !Double.isFinite(north)
        || !Double.isFinite(west)
        || !Double.isFinite(east)
        || south < -90
        || north > 90
        || west < -180
        || east > 180
        || south >= north
        || west >= east
        || north - south > .1
        || east - west > .1
        || zoom < 15
        || zoom > 22) throw new IllegalArgumentException("지도를 더 확대해 주세요.");
    var items =
        db.queryForList(
            """
            select s.id,s.latitude,s.longitude,
              case when exists(select 1 from inspections i where i.site_id=s.id and i.phase='END') then 'DONE'
                   when exists(select 1 from inspections i where i.site_id=s.id and i.phase='START') then 'IN_PROGRESS'
                   else 'TODO' end as status
            from worksites s
            where s.latitude between :south and :north and s.longitude between :west and :east
              and not (s.latitude=0 and s.longitude=0)
            order by s.id limit 501
            """,
            Map.of("south", south, "north", north, "west", west, "east", east));
    // Never silently display an arbitrary partial selection in dense regions.
    boolean truncated = items.size() > 500;
    return ApiResult.ok(
        Map.of("items", truncated ? java.util.List.of() : items, "truncated", truncated));
  }
}
