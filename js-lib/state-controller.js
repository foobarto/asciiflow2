goog.provide('ascii.StateController');

goog.require('ascii.Vector');

/** 
 * Draws a line.
 */
function drawLine(state, startPosition, endPosition, clockwise) {
  var hX1 = Math.min(startPosition.x, endPosition.x);
  var vY1 = Math.min(startPosition.y, endPosition.y);
  var hX2 = Math.max(startPosition.x, endPosition.x);
  var vY2 = Math.max(startPosition.y, endPosition.y);

  var hY = clockwise ? startPosition.y : endPosition.y;
  var vX = clockwise ? endPosition.x : startPosition.x;

  while (hX1++ < hX2) {
    state.drawSpecial(new ascii.Vector(hX1, hY));
  }
  while (vY1++ < vY2) {
    state.drawSpecial(new ascii.Vector(vX, vY1));
  }
  state.drawSpecial(startPosition);
  state.drawSpecial(endPosition);
  state.drawSpecial(new ascii.Vector(vX, hY));
};

/**
 * Common interface for different drawing functions, e.g. box, line, etc.
 * @interface
 */
function DrawFunction() {}
/** Start of drawing. @param {ascii.Vector} position */
DrawFunction.prototype.start = function(position) {};
/** Drawing move. @param {ascii.Vector} position */
DrawFunction.prototype.move = function(position) {};
/** End of drawing. @param {ascii.Vector} position */
DrawFunction.prototype.end = function(position) {};

/**
 * @constructor
 * @implements {DrawFunction}
 * @param {ascii.State} state
 */
function DrawBox(state) {
  this.state = state;
  /** @type {ascii.Vector} */ this.startPosition = null;
}

DrawBox.prototype.start = function(position) {
  this.startPosition = position;
};
DrawBox.prototype.move = function(position) {
  this.endPosition = position;
  this.state.clearDraw();
  drawLine(this.state, this.startPosition, position, true);
  drawLine(this.state, this.startPosition, position, false);
};
DrawBox.prototype.end = function(position) {
  this.state.commitDraw();
};


/**
 * @constructor
 * @implements {DrawFunction}
 * @param {ascii.State} state
 */
function DrawLine(state) {
  this.state = state;
  /** @type {ascii.Vector} */ this.startPosition = null;
}

DrawLine.prototype.start = function(position) {
  this.startPosition = position;
};
DrawLine.prototype.move = function(position) {
  this.state.clearDraw();

  // Try to infer line orientation.
  var startContext = this.state.getContext(this.startPosition);
  var endContext = this.state.getContext(position);
  var clockwise = (startContext.up && startContext.down) ||
      (endContext.left && endContext.right);

  drawLine(this.state, this.startPosition, position, clockwise);
};

DrawLine.prototype.end = function(position) {
  this.state.commitDraw();
};

/**
 * @constructor
 * @implements {DrawFunction}
 * @param {ascii.State} state
 * @param {?string} value
 */
function DrawFreeform(state, value) {
  this.state = state;
  this.value = value;
}

DrawFreeform.prototype.start = function(position) {
  this.state.setValue(position, this.value);
};
DrawFreeform.prototype.move = function(position) {
  this.state.setValue(position, this.value);
};

DrawFreeform.prototype.end = function(position) {
};

/**
 * @constructor
 * @implements {DrawFunction}
 * @param {ascii.State} state
 */
function DrawMove(state) {
  this.state = state;
  this.ends = null;
}

DrawMove.prototype.start = function(position) {
  var context = this.state.getContext(position);
  var directions = [
    new ascii.Vector(1, 0),
    new ascii.Vector(-1, 0),
    new ascii.Vector(0, 1),
    new ascii.Vector(0, -1) ];

  var ends = [];
  for (var i in directions) {
    var midPoint = this.followLine(position, directions[i]);
    // Clockwise is a lie, it is true if we move vertically first.
    var clockwise = (directions[i].x != 0);
    // Ignore any directions that didn't go anywhere.
    if (position.equals(midPoint)) {
      continue;
    }
    var midPointContext = this.state.getContext(midPoint);
    // Special case, a straight line with no turns.
    if ((midPointContext.left + midPointContext.right +
        midPointContext.up + midPointContext.down) == 1) {
      ends.push({position: midPoint, clockwise: clockwise});
      continue;
    }
    // Continue following lines from the midpoint.
    for (var j in directions) {
      if (directions[i].add(directions[j]).length() == 0) {
        // Don't go back on ourselves.
        continue;
      }
      var end = this.followLine(midPoint, directions[j]);
      // Ignore any directions that didn't go anywhere.
      if (midPoint.equals(end)) {
        continue;
      }
      ends.push({position: end, clockwise: clockwise});
    }
  }
  this.ends = ends;
};

DrawMove.prototype.move = function(position) {
  this.state.clearDraw();
  for (var i in this.ends) {
    drawLine(this.state, position, this.ends[i].position, this.ends[i].clockwise);
  }
};

DrawMove.prototype.end = function(position) {
  this.state.commitDraw();
};

DrawMove.prototype.followLine = function(startPosition, direction) {
  var endPosition = startPosition.clone();
  while (true) {
    var nextEnd = endPosition.add(direction);
    if (!this.state.isSpecial(nextEnd)) {
      return endPosition;
    }
    endPosition = nextEnd;
    var context = this.state.getContext(nextEnd);
    if (!(context.left && context.right && !context.up && !context.down) &&
        !(!context.left && !context.right && context.up && context.down)) {
      return endPosition;
    }
  }
};

/**
 * Handles management of the diagram state. Input events are cleaned in the
 * parent controller and passed down to this class for dealing with drawing.
 *
 * @constructor
 * @param {ascii.State} state
 */
ascii.StateController = function(state) {
  /** @type {ascii.State} */ this.state = state;
  /** @type {DrawFunction} */ this.drawFunction = new DrawBox(state);

  $('#box-button').click(function(e) {
    this.drawFunction = new DrawBox(state);
  }.bind(this));

  $('#line-button').click(function(e) {
    this.drawFunction = new DrawLine(state);
  }.bind(this));

  $('#freeform-button').click(function(e) {
    this.drawFunction = new DrawFreeform(state, 'O');
  }.bind(this));

  $('#erase-button').click(function(e) {
    this.drawFunction = new DrawFreeform(state, null);
  }.bind(this));

  $('#move-button').click(function(e) {
    this.drawFunction = new DrawMove(state);
  }.bind(this));
};

/**
 * Handles a press in the context of the drawing frame.
 * @param {ascii.Vector} position
 */
ascii.StateController.prototype.handleDrawingPress = function(position) {
  this.drawFunction.start(position);
};

/**
 * Handles a release in the context of the drawing frame.
 * @param {ascii.Vector} position
 */
ascii.StateController.prototype.handleDrawingRelease = function(position) {
  this.drawFunction.end(position);
};

/**
 * Handles a move in the context of the drawing frame.
 * @param {ascii.Vector} position
 */
ascii.StateController.prototype.handleDrawingMove = function(position) {
  this.drawFunction.move(position);
};