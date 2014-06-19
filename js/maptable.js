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

      // Add watermark
      if(options.watermark_class){
        d3.select(options.map_selector)
                .append("div")
                .attr("class", options.watermark_class);
      }
  
      // Load projection
      projection = d3.geo.equirectangular()
                      .scale((options.width / 680) * 100)
                      .rotate([-11,0]).precision(0.1);

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

      // Prepare zoom listerner
      zoomListener = d3.behavior
      .zoom()
      .scaleExtent(options.scale_zoom)
        .on("zoom", redraw);

      // Create Svg
      svg = d3.select(options.map_selector)
              .append("svg")
              .attr("width", options.width)
              .attr("height", options.height)
              .call(zoomListener)
              .append("g");

      // Create a gaussian blur filter
      var filter = svg.append("defs")
        .append("filter")
          .attr("id", "blur")
        .append("feGaussianBlur")
          .attr("stdDeviation", 0.4);

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
          .append("span")
          .attr("class", "column_header")
          .attr("id", function(d){
            return "column_header_" + d.id;
          })
          .text(function(d){
            return d.displayName;
          })
          .on("click", function(d){
              sortColumn(d.id);
          });

      // Download Country Data
      queue()
        .defer(d3.json, options.map_json_path)
        .defer(d3.tsv, options.countries_name_tsv_path)
        .await(buildBaseMap);

      // Download shaded relief vector data and call buildOverlayMap to add it to the SVG.
      queue()
        .defer(d3.json, options.sr_json_path)
        .await(buildOverlayMap);
    },

    addFilter : function(){
      filters.newFilter();
    }
  }

  // PRIVATE

  default_options = {
    width: 900,
    height: 390,
    map_selector: "#map",
    table_container: "#table",
    filters_new_filter_selector: "#filters_new_filter",
    filters_reset_selector: "#filters_reset",
    table_class: "table table-striped",
    marker_class: "marker",
    tooltip_class: "tooltip",
    map_json_path : "data/countries.topo.json",
    sr_json_path : "data/shaded_relief.topo.json", 
    countries_name_tsv_path : "data/country-names.tsv",
    radius_point : 3,
    tooltip_marker : true,
    tooltip_country : false,
    fit_content_margin: 10,
    scale_zoom : [1, 10],
    animation_duration: 750,
    range_values : [
      {
        value: "",
        text: "any"
      }, {
        value: "<",
        text: "less than"
      }, {
        value: "=",
        text: "exactly"
      }, {
        value: ">",
        text: "more than"
      }
    ]
  };

  var options = {},
  tooltip,
  zoomListener,
  svg,
  projection,
  color,
  table_body,
  filters;

  currentSorting = [];

  rawData = [];

  scale = 1;

  scale_markers = function(){
    return Math.pow(scale, 2/3);
  };

  transX = 0;
  transY = 0;

  redraw = function(filter_using_frame){
    if(d3.event != null && typeof(d3.event.translate) != "undefined"){
      scale = d3.event.scale;
      transX = (scale == 1) ? 0 : d3.event.translate[0];
      transY = (scale == 1) ? 0 : d3.event.translate[1];
    }
    data = buildData(filter_using_frame);

    // Build Title
    if(document.querySelector(options.title_selector)){
      showing = data.length;
      total = rawData.length;
      inline_filters = "";

      if(filters){
        inline_filters = filters.inlineFilters();
      }

      document.querySelector(options.title_selector).innerHTML = options.title_format(showing, total, inline_filters);
    }


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

  renderScaledMap = function(withTransition){
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

    if(d3.event != null && typeof(d3.event.translate) != "undefined"){
      d3.event.translate[0] = transX;
      d3.event.translate[1] = transY;
    }

    g = svg;
    if(withTransition){
      g = svg.transition().ease('cubic-inOut').duration(options.animation_duration);
    }
    g.attr("transform", "translate(" + transX + ", " + transY + ")scale(" + scale + ")");

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

 /**
  * Adds a shaded relief map overlay to the base layer. Called by a Queue object in MapTable.module.init().
  * @param {string} error 
  * @param {Object} Shaded relief TopoJSON data, loaded via Queue  
  * @return {Null} Sets topography object, marshalling SVG elements; does not return a response.  
  */
  buildOverlayMap = function(error, relief) {
    var hillshading = topojson.object(relief, relief.objects.world_110m_geo).geometries,
      i = -1,
      n = hillshading.length;
    topography = svg.selectAll(".relief").data(hillshading);
    topography
      .enter()
      .insert("path")
      .attr("class", "relief")
      .attr("title", "mountain")
      .attr("d", d3.geo.path().projection(projection))
      .style("fill", "#000")
      .style("fill-rule", "nonzero")
      .style("stroke-opacity", "0")
      .style("fill-opacity", "0.3")
      .attr("filter", "url(#blur)");
  }

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

      if(options.default_sorting){        
        sortColumn(options.default_sorting.id, options.default_sorting.mode);
      }
      data = buildData();
      renderTable(data);
      renderMarkers(data);
      filters = loadFilters();

    });
  };

  buildData = function(filter_using_frame){
    boundaries = getBoundaries();
    data = rawData;

    if(filter_using_frame !== true){
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
    }

    if(filters){
      data = data.filter(filters.checkWithFilter);
    }

    if(currentSorting){
      mode = (currentSorting.mode == "asc") ? d3.ascending : d3.descending;
      filter_options = filterOptions(currentSorting.id);
      data = data.sort(function(a,b) {

        el1 = a[currentSorting.id];
        el2 = b[currentSorting.id];

        if(filter_options.filter == "number"){
          el1 = parseInt(el1);
          el2 = parseInt(el2);
        }
        else if(filter_options.filter == "date"){
          el1 = Date.parse(el1);
          el2 = Date.parse(el2);
        }
        else if(filter_options.filter == "custom"){
          el1 = filter_options.format(el1);
          el2 = filter_options.format(el2);
        }

        return mode(el1, el2);
      });
    }

    return data;
  };


  rangeToBool = function(el1, range, el2){
    if(range == "="){
      return parseInt(el1) == parseInt(el2);
    }
    else if(range == ">"){
      return parseInt(el1) >= parseInt(el2);
    }
    else if(range == "<"){
      return parseInt(el1) <= parseInt(el2);
    }
    else{
      return true;
    }
  }

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
    .attr("r", options.radius_point);

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
    prev = [];
    table_body.selectAll("tr")
      .data(data)
      .html(function (row) {
        tds = "";
        options.table_columns.forEach(function (column) {
          if(!column.grouping){
            tds += "<td>" + row[column.id] + "</td>";
          } 
          else{
            if((prev[column.id] && prev[column.id] == row[column.id])){
              tds += "<td></td>";
            }
            else{
              tds += "<td>" + row[column.id] + "</td>";
              prev[column.id] = row[column.id]
            }
          }
        });
        return tds;
      });
  };

  sortColumn = function(column_id, mode){
    if(column_id == currentSorting.id){
      if(currentSorting.mode == "asc"){
        mode = "desc"; 
      }
      else{
        mode = "asc";
      }
    }
    if(!mode) mode = "desc";

    currentSorting = {id: column_id, mode: mode};
    column_headers = document.getElementsByClassName('column_header');
    for(var i=0; i<column_headers.length; i++){
      column_headers[i].setAttribute("class", "column_header");
    }
    document.getElementById('column_header_' + column_id).setAttribute("class", "column_header sort_"+mode);

    redraw();
  };

  filterOptions = function(filter_name){
    obj = null;
    options.table_columns.forEach(function(f){
      if(f.id == filter_name){
        obj = f;
      }
      return;
    });
    return obj;
  };

  loadFilters = function(){
    var user_filters = [];

    var methods = {
      newFilter : function(){
        row = buildRow();

        document.querySelector('#filters_content').appendChild(row.node);
        user_filters.push(row.name);

        updateFilterDropdowns();
        checkReachMaxFilters();
      },
      reset: function(){
        user_filters = [];
        var li = document.getElementsByClassName('filter_element');

        while(li[0]) {
          li[0].parentNode.removeChild(li[0]);
        }
        checkReachMaxFilters();

        transX = 0;
        transY = 0;
        scale = 1;

        zoomListener.translate([transX,transY]).scale(scale);

        renderScaledMap(true);
        renderScaledMarkers();

        window.setTimeout(redraw,options.animation_duration);
      }
      ,
      checkWithFilter : function(d){
        filter_elements = document.getElementsByClassName("filter_element");
        for(i=0;i<filter_elements.length;i++){
          li = filter_elements[i];
          filter_name = li.querySelector(".dropdown_filter").value;
          filter_value = li.querySelector(".input_value").value;
          filter_options = filterOptions(filter_name);
          if(filter_value == "") continue;
          if(filter_options.filter == "dropdown"){
            if(d[filter_name] != filter_value) return false;
          }
          else if(filter_options.filter == "field"){
            if(d[filter_name].toLowerCase().indexOf(filter_value.toLowerCase()) === -1) return false;
          }
          else if(filter_options.filter == "number"){
            filter_range = li.querySelector(".dropdown_range").value;
            if(!rangeToBool(d[filter_name], filter_range,  filter_value)) return false;
          }
          else if(filter_options.filter == "custom"){
            filter_range = li.querySelector(".dropdown_range").value;
            if(!rangeToBool(
              filter_options.format(d[filter_name]),
              filter_range,
              filter_options.format(filter_value))
            ) return false;
          }
          else if(filter_options.filter == "date"){
            if(d[filter_name] == "") return false;
            filter_range = li.querySelector(".dropdown_range").value;
            if(!rangeToBool(
              Date.parse(d[filter_name]), 
              filter_range, 
              Date.parse(filter_value)
              )
            ) return false;
          }
        };
        return true; 
      },
      inlineFilters : function(){
        var output_array = [];

        var filter_elements = document.getElementsByClassName("filter_element");

        for(i=0;i<filter_elements.length;i++){
          li = filter_elements[i];
          filter_name = li.querySelector(".dropdown_filter").value;
          filter_value = li.querySelector(".input_value").value;
          filter_options = filterOptions(filter_name);
          if(filter_value == "") continue;

          var out = filter_options.displayName + " ";

          if(filter_options.filter == "field"){
            out += "contains ";
          }
          else{
            out += "is ";
          }

          if(filter_options.filter == "number" || filter_options.filter == "date"){
            filter_range_select = li.querySelector(".dropdown_range");
            if(filter_range_select.value != ""){
              out += filter_range_select.options[filter_range_select.selectedIndex].text + " ";
            }
          }

          out += "<b>" + filter_value + "</b>";

          output_array.push(out);
        }
        return output_array.join(", ");
      }
    };

    fitContent= function(){

      data = buildData(true);
      hor = d3.extent(data, function(d) { return d.x; });
      ver = d3.extent(data, function(d) { return d.y; });

      // center dots with the good ratio
      ratio = options.width/options.height;

      // We add options.radius_point*2 to fit until the right/bottom part of the marker
      currentW = (hor[1] - hor[0]) + options.radius_point*2;
      currentH = (ver[1] - ver[0]) + options.radius_point*2;

      realH = currentW/ratio;
      realW = currentH*ratio;

      diff_margin_width = 0;
      diff_margin_height = 0;

      if(realW >= currentW){
        diff_margin_width = (realW - currentW)/2;
      }
      else{
        diff_margin_height = (realH - currentH)/2;
      }

      // add layout margin
      hor[0] -= (options.fit_content_margin + diff_margin_width);
      hor[1] += (options.fit_content_margin + diff_margin_width);
      ver[0] -= (options.fit_content_margin + diff_margin_height);
      ver[1] += (options.fit_content_margin + diff_margin_height);

      scale = options.width / (hor[1] - hor[0]);
      transX = -1*hor[0]*scale;
      transY = -1*ver[0]*scale;

      zoomListener.translate([transX,transY]).scale(scale);

      renderScaledMap(true);
      renderScaledMarkers();

    };

    buildRow = function(filter_name){
      var remaining_filters = getRemainingFilters();

      if(remaining_filters.length == 0) return {node: null, name: null};

      if(typeof(filter_name) !== "string") filter_name = remaining_filters[0].id;
      
      var filter_options = filterOptions(filter_name);

      var row = document.createElement("li");
      row.setAttribute("class", "filter_element");

      appendButtons(row, filter_name);

      // Filter verb
      var filter_and = document.createElement("span");
      filter_and.setAttribute("class", "text and_filter");
      filter_and.innerText = "And ";
      row.appendChild(filter_and);



      // Filter select
      var filter_select = document.createElement("select");
      filter_select.setAttribute("class", "dropdown_filter");
      filter_select.setAttribute("data-current", filter_name);
      filter_select = appendOptions(filter_select, remaining_filters);
      filter_select.value = filter_name;

      filter_select.addEventListener("change", function(select){
        changeFilter(this);
      });
      filter_select.addEventListener("change", redraw);
      row.appendChild(filter_select);

      // Filter verb
      var filter_verb = document.createElement("span");
      filter_verb.setAttribute("class", "text");
      if(filter_options.filter == "field"){
        filter_verb.innerText = " contains ";
      }
      else{
        filter_verb.innerText = " is ";
      }
      row.appendChild(filter_verb);

      // Filter range
      if(filter_options.filter != "field" && filter_options.filter != "dropdown"){
        var filter_range = document.createElement("select");
        filter_range.setAttribute("class", "dropdown_range");
        options.range_values.forEach(function(r){
          option = document.createElement("option");
          option.value = r.value;
          option.innerText = r.text;
          filter_range.appendChild(option);
        });
        filter_range.addEventListener("change", function(){
          changeRange(this);
        });
        filter_range.addEventListener("change", function(){
          redraw(true);
          fitContent(true);
        });
        row.appendChild(filter_range);

        // Little space:
        row.appendChild(document.createTextNode(" "));

      }

      // Filter value
      if(filter_options.filter != "dropdown"){
        var filter_value = document.createElement("input");
        if(filter_options.filter == "number"){
          filter_value.setAttribute("type", "number");
        }
        else if(filter_options.filter == "date"){
          filter_value.setAttribute("type", "date");
        }
        else{
          filter_value.setAttribute("type", "text");
        }
        filter_value.addEventListener("keyup", redraw);
        filter_value.addEventListener("change", function(){
          redraw(true);
          fitContent(true);
        });
      }
      else{
        var filter_value = document.createElement("select");

        unique_values = d3.nest()
        .key(function(d) {
          return d[filter_name]
        })
        .sortKeys(d3.ascending)
        .entries(rawData);

        option = document.createElement("option");
        option.value = "";
        option.innerText = "Any";
        filter_value.appendChild(option);

        unique_values.forEach(function(d){
          option = document.createElement("option");
          option.value = d.key;
          option.innerText = d.key;
          filter_value.appendChild(option);
        });
        filter_value.addEventListener("change", function(){
          redraw(true);
          fitContent(true);
        });


      }
      filter_value.setAttribute("class", "input_value");

      row.appendChild(filter_value);

      if(typeof(filter_range) != "undefined"){
        changeRange(filter_range);
      }


      return {node: row, name: filter_name};
    };

    changeRange = function(filter_range){
      if (filter_range.value == "") {
        displayValue = "none";
      } else {
        displayValue = "inline-block";
      }
      filter_range.parentNode.querySelector(".input_value").style.display = displayValue;
    };

    changeFilter = function(select) {
      var li, new_filter_name, new_li, old_filter_index, old_filter_name;
      li = select.parentNode;
      old_filter_name = select.getAttribute("data-current");
      new_filter_name = select.value;

      old_filter_index = user_filters.indexOf(old_filter_name);
      user_filters.splice(old_filter_index, 1);

      row = buildRow(new_filter_name);
      new_li = row.node;

      user_filters.push(row.name);

      li.parentNode.replaceChild(new_li, li);

      updateFilterDropdowns();
    };

    updateFilterDropdowns = function(){
      dropdowns = document.querySelectorAll('.dropdown_filter');
      for(var i = 0; i < dropdowns.length; i++){
        filter_select = dropdowns[i];
        filter_name = filter_select.value;
        remaining_filters = getRemainingFilters(filter_name);
        filter_select.innerHTML = "";
        filter_select = appendOptions(filter_select, remaining_filters);
        filter_select.value = filter_name;
      };
    };

    appendOptions = function(select, data, default_value){
      data.forEach(function(f){
        // Filter select
        option = document.createElement("option");
        option.setAttribute("value", f.id);
        option.innerText = f.displayName;
        select.appendChild(option);
      });
      select.value = default_value;
      return select;
    };

    getRemainingFilters = function(except){
      return options.table_columns.filter(function(v) {
        return (except && except == v.id) || (user_filters.indexOf(v.id) === -1 && v.filter);
      });
    };

    appendButtons = function(li, filter_name){
      btn_group = document.createElement("div");
      btn_group.setAttribute("class", "btn-group pull-right");

      btn_plus = document.createElement("button");
      btn_plus.setAttribute("class", "btn btn-plus");
      btn_plus.innerText = "+";
      btn_plus.addEventListener("click", function(){
        plusFilter(li);
      });
      btn_group.appendChild(btn_plus);


      btn_minus = document.createElement("button");
      btn_minus.setAttribute("class", "btn btn-minus");
      btn_minus.innerText = "-";
      btn_minus.addEventListener("click", function(){
        minusFilter(li);
      });
      btn_group.appendChild(btn_minus);

      li.appendChild(btn_group);
    }

    plusFilter = function(after_element) {
      var row;
      if (after_element == null) {
        after_element = '';
      }
      row = buildRow();
      if (after_element === '') {
        document.querySelector('#filters_content').appendChild(row.node);
      } else {
        after_element.parentNode.insertBefore(row.node, after_element.nextSibling);
      }
      user_filters.push(row.name);
      updateFilterDropdowns();
      checkReachMaxFilters();
    };

    minusFilter = function(li){
      filter_name = li.querySelector(".dropdown_filter").value;
      li.remove();
      filter_index = user_filters.indexOf(filter_name);
      user_filters.splice(filter_index, 1);

      updateFilterDropdowns();
      checkReachMaxFilters();
    };

    checkReachMaxFilters = function(){
      if(getRemainingFilters().length == 0){
        disableNewFilter = true;
      }
      else{
        disableNewFilter = false;
      }
      document.querySelector(options.filters_new_filter_selector + " .btn").disabled = disableNewFilter;



      btns = document.querySelectorAll(".btn-plus");
      for(i=0;i<btns.length;i++){
        btns[i].disabled = disableNewFilter;
      };
      
      document.querySelector('.filters_label').style.display = (user_filters.length == 0) ? "none" : "block";
      document.querySelector('.btn-reset').style.display = (user_filters.length == 0) ? "none" : "block";

    };
    appendNewFilter = function(){
      document.querySelector(options.filters_new_filter_selector).innerHTML = "";
      new_filter_btn = document.createElement("button");
      new_filter_btn.setAttribute("class", "btn");
      new_filter_btn.innerText = "+ New filter";
      new_filter_btn.addEventListener("click", methods.newFilter);

      document.querySelector(options.filters_new_filter_selector).appendChild(new_filter_btn);
    };
    appendReset = function(){
      document.querySelector(options.filters_reset_selector).innerHTML = "";
    
      reset_btn = document.createElement("button");
      reset_btn.setAttribute("class", "btn btn-reset");
      reset_btn.innerText = "↺ Reset";
      reset_btn.addEventListener("click", methods.reset);

      document.querySelector(options.filters_reset_selector).appendChild(reset_btn);

      document.querySelector(options.filters_reset_selector).appendChild(document.createTextNode(" "));
    };


    appendNewFilter();
    appendReset();
    checkReachMaxFilters();
    return methods;
  };

  return module;

}(d3, queue));
