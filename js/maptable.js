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
    },

    addFilter : function(){
      filters.newFilter();
    }
  }

  // PRIVATE

  default_options = {
    width: 900,
    height: 450,
    map_selector: "#map",
    table_container: "#table",
    filters_new_filter_selector: "#filters_new_filter",
    filters_reset_selector: "#filters_reset",
    table_class: "table table-stripped",
    marker_class: "marker",
    tooltip_class: "tooltip",
    map_json_path : "data/world-110m.json",
    countries_name_tsv_path : "data/country-names.tsv",
    radius_point : 3,
    tooltip_marker : true,
    tooltip_country : false,
    scale_zoom : [1, 25],
    range_values : [
      {
        value: "",
        text: "Any"
      }, {
        value: "<",
        text: "Less than"
      }, {
        value: "=",
        text: "Exactly"
      }, {
        value: ">",
        text: "More than"
      }
    ]
  };

  var options = {},
  tooltip,
  svg,
  projection,
  color,
  table_body,
  filters;

  rawData = [];

  scale = 1;

  scale_markers = function(){
    return Math.pow(scale, 2/3);
  };

  transX = 0;
  transY = 0;

  redraw = function(){
    if(d3.event != null){
      scale = d3.event.scale;
      transX = (scale == 1) ? 0 : d3.event.translate[0];
      transY = (scale == 1) ? 0 : d3.event.translate[1];
    }
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

    if(d3.event != null){
      d3.event.translate[0] = transX;
      d3.event.translate[1] = transY;
    }

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
      filters = loadFilters();

    });
  };

  buildData = function(){
    boundaries = getBoundaries();
    data = rawData;

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

    if(filters){
      data = data.filter(filters.checkWithFilter);
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
    table_body.selectAll("tr")
      .data(data)
      .html(function (row) {
        tds = "";
        options.table_columns.forEach(function (column) {
          tds += "<td>" + row[column.id] + "</td>";
        });
        return tds;
      });
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
        redraw();
      },
      checkWithFilter : function(d){
        filter_elements = document.getElementsByClassName("filter_element");
        for(i=0;i<filter_elements.length;i++){
          li = filter_elements[i];
          filter_name = li.querySelector(".dropdown_filter").value;
          filter_value = li.querySelector(".input_value").value;
          filter_options = filterOptions(filter_name);
          if(filter_value == "") continue;
          if(filter_options.filter == "field" || filter_options.filter == "dropdown"){
            if(d[filter_name] != filter_value) return false;
          }
          else if(filter_options.filter == "number"){
            filter_range = li.querySelector(".dropdown_range").value;
            if(!rangeToBool(d[filter_name], filter_range,  filter_value)) return false;
          }
          /*
          else if(filter_options.filter == "date"){
            return rangeToBool(d[filter_name], filter_range,  filter_value);
          }
          */
        };
        return true; 
      }
    };

    

    buildRow = function(filter_name){
      var remaining_filters = getRemainingFilters();

      if(remaining_filters.length == 0) return {node: null, name: null};

      if(typeof(filter_name) !== "string") filter_name = remaining_filters[0].id;
      filter_options = filterOptions(filter_name);

      row = document.createElement("li");
      row.setAttribute("class", "filter_element");

      appendButtons(row, filter_name);

      // Filter select
      filter_select = document.createElement("select");
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
      filter_verb = document.createElement("span");
      if(filter_options.filter == "field"){
        filter_verb.innerText = " contains ";
      }
      else{
        filter_verb.innerText = " is ";
      }
      row.appendChild(filter_verb);

      // Fitler range
      if(filter_options.filter != "field" && filter_options.filter != "dropdown"){
        filter_range = document.createElement("select");
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
        filter_range.addEventListener("change", redraw);
        row.appendChild(filter_range);

        // Little space:
        row.appendChild(document.createTextNode(" "));

      }

      // Filter value
      if(filter_options.filter != "dropdown"){
        filter_value = document.createElement("input");
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
      }
      else{
        filter_value = document.createElement("select");

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
        filter_value.addEventListener("change", redraw);


      }
      filter_value.setAttribute("class", "input_value");

      row.appendChild(filter_value);

      if(typeof(filter_range) != "undefined"){
        changeRange(filter_range);
      }


      return {node: row, name: filter_name};
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
    };
    appendNewFilter = function(){
      document.querySelector(options.filters_new_filter_selector).innerHTML = "";
      add_filter_link = document.createElement("button");
      add_filter_link.setAttribute("class", "btn");
      add_filter_link.innerText = "+ New filter";
      add_filter_link.addEventListener("click", methods.newFilter);

      document.querySelector(options.filters_new_filter_selector).appendChild(add_filter_link);
    };
    appendReset = function(){
      document.querySelector(options.filters_reset_selector).innerHTML = "";
      add_filter_link = document.createElement("button");
      add_filter_link.setAttribute("class", "btn");
      add_filter_link.innerText = "↺ Reset";
      add_filter_link.addEventListener("click", methods.reset);

      document.querySelector(options.filters_reset_selector).appendChild(add_filter_link);
    };

    appendNewFilter();
    appendReset();
    methods.newFilter();
    return methods;
  };

  return module;

}(d3, queue));
