package com.lostquest.controller;

import com.lostquest.service.PlaceSearchService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

@RestController
public class PlaceSearchController {
    private final PlaceSearchService service;
    public PlaceSearchController(PlaceSearchService service) { this.service = service; }
    @GetMapping("/api/places/search")
    public List<PlaceSearchService.Place> search(@RequestParam String q) { return service.search(q); }
}
