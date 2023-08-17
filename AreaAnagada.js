//Poligono del campo definido como geomtry 
var AOI = geometry

//Viz centradoal poligono
Map.centerObject(AOI, 12);

// Landsat-8 BOA collection. 
var L8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_RT_TOA');
 
//filter coleccion para AOI
var L8_AOI = L8.filterBounds(AOI);


// rango temporal 
var y0 = 2014;
var yn = 2022;
  
// formato fecha ee
var inicio = ee.Date.fromYMD(y0,1,1);
var fin = ee.Date.fromYMD(yn,12,31);
 
//Filtrar colecion por fecha 
var L8_rango = L8_AOI.filterDate(inicio,fin);
print("Numero de imagenes:",L8_rango.size());


//Filtro nubes
var nubes = function(image){
  //tomar solo <20% de nubosidad 
  var cloud_thresh = 20;
  //probabilidad 
  var CloudScore = ee.Algorithms.Landsat.simpleCloudScore(image);
  //filtrar
  var quality = CloudScore.select('cloud');
  //filtar pixelesmayores al limite
  var cloud01 = quality.gt(cloud_thresh);
  //mascara sobre el resto de los pixeles
  var cloudmask = image.mask().and(cloud01.not());
  return image.updateMask(cloudmask);
};
 
// aplicar funcion 
var L8_limpias = L8_rango.map(nubes);
 
Map.addLayer(L8_limpias.mosaic().clip(AOI), { min:0.05, max: 0.8, bands: ['B6', 'B5', 'B4']},'Landsat 8 AOI');


//Calcular NDWI con banas NIR(B5) y Green (B3)

function c_ndwi(img) {
  var ndwi = img.normalizedDifference(['B3', 'B5']).rename('NDWI');
  return img.addBands(ndwi);
}
 
var L8_ndwi = L8_limpias.map(c_ndwi);

//valor limite para diferenciar entre seco y humedo
var limite = 0.4;
 
// seleccionar seco y humedo del calculo de NDWI 
var seco = L8_ndwi.select("NDWI").reduce(ee.Reducer.percentile([10]));
var humedo = L8_ndwi.select("NDWI").reduce(ee.Reducer.percentile([90]));
 
var diff = humedo.subtract(seco);
 
var area_anegada = diff.updateMask(diff.gt(limite)).clip(AOI);
 
// viz 
Map.addLayer(seco.clip(AOI),{min:-0.3, max:0.4, palette:"white,blue,darkblue"},"seco");
Map.addLayer(humedo.clip(AOI),{min:-0.3, max:0.8, palette:"white,blue,darkblue"}, "humedo");
Map.addLayer(area_anegada,{palette:"purple"}, "Area anegada");


// Calcular el área del polígono en metros cuadrados
var areaPoligonoMetrosCuadrados = AOI.area();

// Calcular el área del polígono en hectáreas
var areaPoligonoHectareas = areaPoligonoMetrosCuadrados.divide(10000);

// Imprimir el área en la consola
print("Área del polígono:", areaPoligonoHectareas, "hectáreas");


// Crear una lista de años dentro del rango
var years = ee.List.sequence(y0, yn);

var calcularAreaAnegada = function(year) {
  // Filtrar imágenes por año
  var imagenesAño = L8_ndwi.filter(ee.Filter.calendarRange(year, year, 'year'));

  // Calcular el área anegada en ese año
  var areaAnegada = imagenesAño.select("NDWI")
    .reduce(ee.Reducer.percentile([90]))
    .subtract(imagenesAño.select("NDWI")
    .reduce(ee.Reducer.percentile([10])))
    .updateMask(diff.gt(limite))
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: AOI,
      scale: 30,
      maxPixels: 1e9
    });

  // Obtener el valor del área anegada
  var areaAnegadaValue = areaAnegada.values().get(0);

  // Convertir de m² a hectareas
  var areaAnegadaHa = ee.Number(areaAnegadaValue).divide(10000);

  return areaAnegadaHa;
};

// Iterar sobre la lista de años y llamar a la función calcularAreaAnegada para cada año
var areasAnegadas = years.map(calcularAreaAnegada);

// Imprimir el resultado en la consola
print("Áreas anegadas por año:", areasAnegadas);



var calcularProporcionAreaAnegada = function(year) {
  // Filtrar imágenes por año
  var imagenesAño = L8_ndwi.filter(ee.Filter.calendarRange(year, year, 'year'));

  // Calcular el área anegada en ese año
  var areaAnegada = imagenesAño.select("NDWI")
    .reduce(ee.Reducer.percentile([90]))
    .subtract(imagenesAño.select("NDWI")
    .reduce(ee.Reducer.percentile([10])))
    .updateMask(diff.gt(limite))
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: AOI,
      scale: 30,
      maxPixels: 1e9
    });

  // Obtener el valor del área anegada
  var areaAnegadaValue = areaAnegada.values().get(0);

  // Calcular el área total del polígono
  var areaPoligono = AOI.area();

  // Calcular la proporción del área anegada en ese año respecto al área total del polígono
  var proporcionAreaAnegada = ee.Number(areaAnegadaValue).divide(areaPoligono).multiply(100);

  return proporcionAreaAnegada;
};

// Iterar sobre la lista de años y llamar a la función calcularProporcionAreaAnegada para cada año
var proporcionesAreaAnegada = years.map(calcularProporcionAreaAnegada);

// Imprimir el resultado en la consola
print("Proporciones del área anegada por año:", proporcionesAreaAnegada);





// Función para agregar un mapa de las áreas anegadas para un año dado
function addFloodMap(year) {
  // Filtrar imágenes por año
  var imagenesAño = L8_ndwi.filter(ee.Filter.calendarRange(year, year, 'year'));

  // Calcular el área anegada en ese año
  var seco = imagenesAño.select("NDWI").reduce(ee.Reducer.percentile([10]));
  var humedo = imagenesAño.select("NDWI").reduce(ee.Reducer.percentile([90]));
 
  var diff = humedo.subtract(seco);
  var areaAnegada = diff.updateMask(diff.gt(limite));
  
  // Agregar la capa al mapa
  Map.addLayer(areaAnegada.clip(AOI), {palette:"purple"}, "Area anegada " + year);
}

// Función para calcular la área anegada para un año dado
function calcularAreaAnegada(year) {
  // Filtrar imágenes por año
  var imagenesAño = L8_ndwi.filter(ee.Filter.calendarRange(year, year, 'year'));

  // Calcular el área anegada en ese año
  var seco = imagenesAño.select("NDWI").reduce(ee.Reducer.percentile([10]));
  var humedo = imagenesAño.select("NDWI").reduce(ee.Reducer.percentile([90]));
 
  var diff = humedo.subtract(seco);
  var areaAnegada = diff.updateMask(diff.gt(limite))
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: AOI,
      scale: 30,
      maxPixels: 1e9
    });

  // Obtener el valor del área anegada
  var areaAnegadaValue = areaAnegada.values().get(0);

  // Convertir de m² a hectareas
  var areaAnegadaHa = ee.Number(areaAnegadaValue).divide(10000);

  return areaAnegadaHa;
};

// Llamar a la función addFloodMap para cada año en el rango
years.getInfo().forEach(addFloodMap);

// Iterar sobre la lista de años y llamar a la función calcularAreaAnegada para cada año
var areasAnegadas = years.map(calcularAreaAnegada);