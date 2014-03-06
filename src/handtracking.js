/*
Copyright (c) 2012 Juan Mellado

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var HT = HT || {};

HT.Tracker = function(params){
  this.params = params || {};

  this.mask = new CV.Image();
  this.eroded = new CV.Image();
  this.contours = [];
  
  this.skinner = new HT.Skinner();
};

HT.Tracker.prototype.detect = function(image){
  this.skinner.mask(image, this.mask, this.params.detectObject);
  
  if (this.params.fast || true){
    this.blackBorder(this.mask);
  }else{
    CV.erode(this.mask, this.eroded);
    CV.dilate(this.eroded, this.mask);
  }

  this.contours = CV.findContours(this.mask);

  var candidate = this.findCandidate(this.contours, image.width * image.height * 0.05, 0.005, image.width, image.height);
  if (candidate) {
	  candidate.gravity = this.mask.gravity;
	  candidate.fingerGraph = this.fingerGraph;
	  candidate.fingers = this.fingers;
	  candidate.rects = this.mask.rects;
  }
  return candidate;
};

HT.Tracker.prototype.findCandidate = function(contours, minSize, epsilon, width, height) {
  var contour, candidate;

  contour = this.findMaxArea(contours, minSize);
  if (contour) {
    if (this.params.fingers) {
      this.fingerGraph = this.findFingerGraph(contour, this.mask.gravity);
      this.fingers = this.findFingers(this.fingerGraph, width, height);
    }

    contour = CV.approxPolyDP(contour, contour.length * epsilon);

    candidate = new HT.Candidate(contour);
  }

  return candidate;
};

HT.Tracker.prototype.findMaxArea = function(contours, minSize){
  var len = contours.length, i = 0,
      maxArea = -Infinity, area, contour;

  for (; i < len; ++ i){
    area = CV.area(contours[i]);
    if (area >= minSize){
    
      if (area > maxArea) {
        maxArea = area;
      
        contour = contours[i];
      }
    }
  }
  
  return contour;
};

HT.Tracker.prototype.blackBorder = function(image){
  var img = image.data, width = image.width, height = image.height,
      pos = 0, i;

  for (i = 0; i < width; ++ i){
    img[pos ++] = 0;
  }
  
  for (i = 2; i < height; ++ i){
    img[pos] = img[pos + width - 1] = 0;

    pos += width;
  }

  for (i = 0; i < width; ++ i){
    img[pos ++] = 0;
  }
  
  return image;
};


HT.Tracker.prototype.findFingerGraph = function(contour, gravity) {
  var d = [];
  var res = 500;
  var gx = gravity.x, gy = gravity.y;
  var len = contour.length, maxd = 0, mind = 10000;

  for (var i = 0; i < len; ++i) {
    var pt = contour[i];
    var dx = pt.x - gx;
    var dy = pt.y - gy;
    var dl = Math.sqrt(dx * dx + dy * dy);
    var deg = Math.acos(dx / dl);
    if (dy < 0) deg = -deg;
    var index = ~ ~((deg / Math.PI / 2 + 0.5) * res);
    if (!d[index] || d[index].value < dl) {
      d[index] = { value: dl, pt: pt };
    } 
    maxd = Math.max(dl, maxd);
    mind = Math.min(dl, mind);
  }
  var diff = maxd - mind;
  for (var i = 0; i < res; ++i) {
    if (d[i]) {
      d[i].value = (d[i].value - mind) / diff;
    }
  }
  return d;
}

HT.Tracker.prototype.findFingers = function(fingerGraph, width, height, threshold) {
  threshold = threshold || 0.6;
  var flag = 0;
  var pts = 0;
  var max, maxi;
  var result = [];
  var d = fingerGraph;
  var res = fingerGraph.length;
  for (var i = 0; i < fingerGraph.length; ++i) {
    if (d[i]) {
      if (d[i].value > threshold) {
        if (flag == false) {
          flag = true;
          max = d[i].value;
          maxi = i;
        }
        else {
          if (max < d[i].value) {
            max = d[i].value;
            maxi = i;
          }
        }
      }
      else {
        if (flag) {
          flag = false;
          result.push({
            x: d[maxi].pt.x,
            y: d[maxi].pt.y,
            l: d[maxi].value,
            a: maxi
          });
        }
      }
    }
  }
  if (flag) {
    flag = false;
    result.push({
      x: d[maxi].pt.x,
      y: d[maxi].pt.y,
      l: d[maxi].value,
      a: maxi
    });
  }
  //Filter out edge 
  result = result.filter(function(r) {
    var thw = width * 0.03;
    var thh = height * 0.03;
    if (r.x < thw || r.x > width - thw ||
        r.y < thh || r.y > height - thh) {
      return false;
    }
    return true;
  }).sort(function(a, b) { return a.a - b.a });

  var count = 0;
  var maxcount = 0; maxi = 0;
  for (var i = 0; i < result.length; ++i) {
    count = 0;
    for (var j = i + 1; j < result.length; ++j) {
      if (result[j].a - result[i].a < res * 0.6) {
        count++;
      }
    }
    if (count > maxcount) {
      maxcount = count;
      maxi = i;
    }
  }
  var result2 = [];
  for (var j = maxi; j < result.length; ++j) {
    if (result[j].a - result[maxi].a < res * 0.6) {
      result2.push(result[j]);
    }
  }
  return result2.sort(function(a, b) { return b.l - a.l; });
}

HT.Candidate = function(contour){
  this.contour = contour;
  this.hull = CV.convexHull(contour);
  this.defects = CV.convexityDefects(contour, this.hull);
};

HT.Skinner = function(params){
  this.params = params || {depthThreshold: 100};
};

HT.Skinner.prototype.mask = function(imageSrc, imageDst, detectObjects){
  var src = imageSrc.data, dst = imageDst.data, len = src.length,
      i = 0, j = 0,
      r, g, b, h, s, v, value;
  var gravity_x = 0, gravity_y = 0;
  var pts = 0;
  var width = imageSrc.width;
  for(; i < len; i += 4){
    v = src[i];
    value = 0;

    if (v >= this.params.depthThreshold){
        value = 255;
	      var x = j % width;
	      var y = j / width;
	      gravity_x += x;
	      gravity_y += y;
	      pts ++;
    }
    
    dst[j ++] = value;
  }
  gravity_x = gravity_x / pts;
  gravity_y = gravity_y / pts;

  imageDst.width = imageSrc.width;
  imageDst.height = imageSrc.height;
  imageDst.gravity = {
	  x : gravity_x,
	  y : gravity_y
	};
  if (detectObjects)
    imageDst.rects = this.maskObjectDetect(imageDst);
  return imageDst;
};

HT.Skinner.prototype.maskObjectDetect = function (image) {
    var data = image.data, width = image.width, height = image.height;
//    objectdetect.equalizeHistogram(data);
    var sat = objectdetect.computeSat(data, width, height);
    var ssat = objectdetect.computeSquaredSat(data, width, height);
    var rsat = objectdetect.computeRsat(data, width, height);
    var rects = objectdetect.detectMultiScale(sat, rsat, ssat, undefined, width, height, objectdetect.handopen, 1.1 /*options.scaleFactor*/, 3 /*options.scaleMin*/);
    rects = objectdetect.groupRectangles(rects, 1).sort(function (rect) { return rect[2] * rects[3]; });

    if (rects && rects.length > 0) {
        var rect = rects[0];
        var imin = rect[0] + rect[1] * width;
        var imax = imin + rect[2] + rect[3] * width;
        for (var i = 0; i < data.length; ++i) {
            if (i < imin || i > imax)
                data[i] = 0;
        }
    }
    return rects;
}
