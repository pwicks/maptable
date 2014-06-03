var MapTable = (function (d3, queue) {
  
  // PUBLIC 
  var module = {
    init : function(custom_options){
  
      // Load options
      if (!custom_options){custom_options = {};}
  
      // Extends options
      for(var key in custom_options)
        if(custom_options.hasOwnProperty(key))
          default_options[key] = custom_options[key];

      options = default_options;
  
      // Create Tooltip
      tooltip = d3.select(options.map_selector)
        .append("div")
        .attr("class", options.tooltip_class)
        .style("display", "none");
  
      // Load projection
      projection = d3.geo.equirectangular()
                      .scale((options.width / 640) * 100)
                      .translate([options.width / 2, options.height / 2]);

      // Prepare colors
      if(options.color_range != null ){
        color = d3.scale
                .ordinal()
                .range(options.color_range)
                .domain(d3.range(0, (options.color_range.length - 1)));
      }
      else{
        color = d3.scale.category10();
      }

      // Create Svg
      svg = d3.select(options.map_selector)
              .append("svg")
              .attr("width", options.width)
              .attr("height", options.height)
              .call(d3.behavior.zoom().scaleExtent(options.scale_zoom)
                .on("zoom", redraw))
              .append("g");

      // Build Table header

      table = d3.select(options.table_container)
        .append("table")
        .attr("class", options.table_class);

      table_header = table.append("thead");
      
      table_body = table.append("tbody");

      table_header.selectAll("tr")
        .data([1])
        .enter()
        .append("tr")
        .selectAll("th")
          .data(options.table_columns)
          .enter()
          .append("th")
          .html(function(d){
            return d.displayName;
          });

      // Download Data
      queue()
        .defer(d3.json, options.map_json_path)
        .defer(d3.tsv, options.countries_name_tsv_path)
        .await(buildBaseMap);
  
    }
  }

  // PRIVATE

  default_options = {
    width: 900,
    height: 450,
    map_selector: "#map",
    table_container: "#table",
    table_class: "table table-stripped",
    marker_class: "marker",
    tooltip_class: "tooltip",
    map_json_path : "data/world-110m.json",
    countries_name_tsv_path : "data/country-names.tsv",
    radius_point : 3,
    tooltip_marker : true,
    tooltip_country : false,
    scale_zoom : [1, 25]
  };

  var options = {},
  tooltip,
  svg,
  projection,
  color,
  table_body;

  rawData = [];

  scale = 1;

  scale_markers = function(){
    return Math.pow(scale, 2/3);
  };

  transX = 0;
  transY = 0;

  redraw = function(){
    scale = d3.event.scale;
    transX = (scale == 1) ? 0 : d3.event.translate[0];
    transY = (scale == 1) ? 0 : d3.event.translate[1];

    data = buildData();
    renderTable(data);
    renderMarkers(data);

    renderScaledMap();
    renderScaledMarkers();
  };

  getBoundaries = function(){
    nw = [Math.abs(transX / scale), Math.abs(transY / scale)];
    se = [nw[0] + options.width/scale, nw[1] + options.height/scale];

    return {"nw": projection.invert(nw), "se": projection.invert(se)};
  };

  renderScaledMap = function(){
    var maxTransX = 0,
      maxTransY = 0,
      minTransX = options.width * (1 - scale),
      minTransY = options.height * (1 - scale);

    if (transY > maxTransY) {
      transY = maxTransY;
    }
    else if (transY < minTransY) {
      transY = minTransY;
    }
    
    if (transX > maxTransX) {
      transX = maxTransX;
    }
    else if (transX < minTransX) {
      transX = minTransX;
    }
    d3.event.translate[0] = transX;
    d3.event.translate[1] = transY;

    svg.attr("transform", "translate(" + transX + ", " + transY + ")scale(" + scale + ")");

  };

  renderScaledMarkers = function(){
    d3.selectAll("."+options.marker_class).each(function (d) {
        // radius
        d3.select(this).attr("r", options.radius_point / scale_markers());
        // stroke
        d3.select(this).style("stroke-width", 1 / scale_markers());
      }
    );
  };

  buildBaseMap = function(error, world, names){
    
    var countries = topojson.object(world, world.objects.countries).geometries,
      neighbors = topojson.neighbors(world, countries),
      i = -1,
      n = countries.length;

    countries.forEach(function (d) {
      var tryit = names.filter(function (n) {
        return d.id == n.id;
      })[0];
      if (typeof tryit === "undefined") {
        d.name = "Undefined";
      } else {
        d.name = tryit.name;
      }
    });
    country = svg.selectAll(".country").data(countries);
    country
      .enter()
      .insert("path")
      .attr("class", "country")
      .attr("title", function (d, i) {
        return d.name;
      })
      .attr("d", d3.geo.path().projection(projection))
      .style("fill", function (d, i) {
        return color(d.color = d3.max(neighbors[i], function (n) {
          return countries[n].color;
        }) + 1 | 0);
      });

    if(options.tooltip_country == true){
      activateTooltip(country, tooltip_country_content);
    }

    loadData();

  };

  tooltipPosition = function(mouse){
    return "left:" + (mouse[0] + 5) + "px;top:" + (mouse[1] + 10) + "px";
  };

  activateTooltip = function(element, tooltip_content, cb){
    element.on("mousemove", function (d, i) {
      mouse = d3.mouse(svg.node())
      .map(function (d) {
        return parseInt(d);
      });

      tooltip.style("display", "block")
      .attr("style", tooltipPosition(mouse))
      .html(tooltip_content(d));
    })
    .on("mouseout", function (d, i) {
      tooltip.style("display", "none");
    })
    .on("click", function (d, i) {
      if(cb) cb(d);
    });
  };

  loadData = function(){
    // Load data
    d3.csv(options.data_csv_path, function (error, _data) {
      rawData = _data.map(function (d) {
        d.longitude = Number(d.longitude);
        d.latitude = Number(d.latitude);
        coord = projection([d.longitude, d.latitude]);
        d.x = coord[0];
        d.y = coord[1];
        return d;
      });

      data = buildData();
      renderTable(data);
      renderMarkers(data);
    });
  };

  buildData = function(){
    boundaries = getBoundaries();
    data = rawData;
    /*
    if (dynatable.settings.dataset.originalRecords.length > 0){
      data = dynatable.settings.dataset.records;
    }
    */
    data = data.filter(function(d){
      if(scale == 1) return true;
      return (
        boundaries.nw[0] < d.longitude 
        && boundaries.se[0] > d.longitude
      ) && (
        boundaries.nw[1] > d.latitude 
        && boundaries.se[1] < d.latitude
      );
    });
    return data;
  };

  renderMarkers = function(data){
    // Enter
    svg.selectAll("."+options.marker_class)
    .data(data)
    .enter()
    .append("svg:circle")
    .attr("class", options.marker_class);

    // Exit
    svg.selectAll("." + options.marker_class)
    .data(data)
    .exit()
    .remove();

    // Update
    svg.selectAll("." + options.marker_class)
    .data(data)
    .attr("cx", function(d){
      return d.x;
    })
    .attr("cy", function(d){
      return d.y;
    })
    .attr("r", options.radius_point)
    .attr("title", function(d){
      return d.formattedAddress;
    });

    if(options.tooltip_marker == true){
      activateTooltip(
        svg.selectAll("."+options.marker_class),
        options.tooltip_marker_content
      );
    }

  };

  renderTable = function(data) {
    // Enter
    table_body.selectAll("tr")
      .data(data)
      .enter()
      .append("tr");

    // Exit
    table_body.selectAll("tr")
    .data(data)
    .exit()
    .remove();

    // Update
    table_body.selectAll("tr")
      .data(data)
      .html(function (row) {
        tds = "";
        options.table_columns.forEach(function (column) {
          tds += "<td>" + row[column.rawName] + "</td>";
        });
        return tds;
      });
  }

  return module;

}(d3, queue));
