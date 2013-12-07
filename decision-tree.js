var dt = (function () {

    function DecisionTree(builder) {
          
        var predicates = {
            '==': function (a, b) { return a == b },
            '>=': function (a, b) { return a >= b },
            '<=': function (a, b) { return a <= b }
        };

        if (builder.removeDefaultPredicates) {
            for (var p in builder.removeDefaultPredicates) {
                var removedPredicateName = builder.removeDefaultPredicates[p];
                delete predicates[removedPredicateName];
            }
        }
        
        var ignoredAttributes = {};
        if (builder.ignoredAttributes) {
            for(var i in builder.ignoredAttributes) {
                var attr = builder.ignoredAttributes[i];
                ignoredAttributes[attr] = true;
            }
        }

        this.root = buildDecisionTree({
            trainingSet: builder.trainingSet,
            categoryAttr: (builder.categoryAttr ? builder.categoryAttr : 'category'),
            minItemsCount: (builder.minItemsCount ? builder.minItemsCount : 1),
            entropyThrehold: (builder.entropyThrehold ? builder.entropyThrehold : 0.01),
            maxTreeDepth: (builder.maxTreeDepth ? builder.maxTreeDepth : 70),
            predicates: predicates,
            ignoredAttributes: ignoredAttributes
        });

        this.predict = function (item) {
            return predict(this.root, item);
        }
    }

    function RandomForest(builder, treesNumber) {

        this.trees = buildRandomForest(builder, treesNumber);

        this.predict = function (item) {
            return predictRandomForest(this.trees, item);
        }
    }
          
    function countUniqueValues(items, attr) {
        var counter = {};

        for (var i in items) {
            var item = items[i];
            var attrValue = item[attr];

            if (counter[attrValue]) {
                counter[attrValue] += 1;
            } else {
                counter[attrValue] = 1;
            }
        }

        return counter;
    }

    function entropy(items, attr) {
        var counter = countUniqueValues(items, attr);

        var entropy = 0;
        for (var i in counter) {
            var p = counter[i] / items.length;
            entropy += -p * Math.log(p);
        }

        return entropy;
    }

    function split(items, attr, predicate, pivot) {
        var match = [];
        var notMatch = [];

        for (var i in items) {
            var item = items[i];
            var attrValue = item[attr];

            if ((attrValue != null) && predicate(attrValue, pivot)) {
                match.push(item);
            } else {
                notMatch.push(item);
            }
        };

        return { match: match, notMatch: notMatch };
    }

    function mostFrequentCategory(items, attr) {
        var counter = countUniqueValues(items, attr);

        var mostFrequentCount = 0;
        var mostFrequentCategory;

        for (var c in counter) {
            if (counter[c] > mostFrequentCount) {
                mostFrequentCount = counter[c];
                mostFrequentCategory = c;
            }
        };

        return mostFrequentCategory;
    }

    function buildDecisionTree(builder) {

        var trainingSet = builder.trainingSet;
        var minItemsCount = builder.minItemsCount;
        var categoryAttr = builder.categoryAttr;
        var entropyThrehold = builder.entropyThrehold;
        var maxTreeDepth = builder.maxTreeDepth;
        var predicates = builder.predicates;
        var ignoredAttributes = builder.ignoredAttributes;

        if((maxTreeDepth == 0) || (trainingSet.length <= minItemsCount)) {
          return { category: mostFrequentCategory(trainingSet, categoryAttr) };
        }
          
        var initialEntropy = entropy(trainingSet, categoryAttr);

        if (initialEntropy <= entropyThrehold) {
          return { category: mostFrequentCategory(trainingSet, categoryAttr) };
        }

        var bestSplit = { gain: 0 };

        for (var i in trainingSet) {
            var item = trainingSet[i];

            for (var attr in item) {
                if ((attr == categoryAttr) || ignoredAttributes[attr]) {
                    continue;
                }
          
                var attrValue = item[attr];
          
                for (var predicateName in predicates) {
                    var predicate = predicates[predicateName];
                    var currSplit = split(trainingSet, attr, predicate, attrValue);

                    var matchEntropy = entropy(currSplit.match, categoryAttr);
                    var notMatchEntropy = entropy(currSplit.notMatch, categoryAttr);

                    var newEntropy = 0;
                    newEntropy += matchEntropy * currSplit.match.length;
                    newEntropy += notMatchEntropy * currSplit.notMatch.length;
                    newEntropy /= trainingSet.length;

                    var currGain = initialEntropy - newEntropy;

                    if (currGain > 0 && bestSplit.gain < currGain) {
                        bestSplit = currSplit;
                        bestSplit.predicateName = predicateName;
                        bestSplit.predicate = predicate;
                        bestSplit.attribute = attr;
                        bestSplit.pivot = attrValue;
                        bestSplit.gain = currGain;
                    }
                }
            }
        }

        if (bestSplit.gain <= 0) {
            // Can't find optimal split
          return { category: mostFrequentCategory(trainingSet, categoryAttr) };
        }

        builder.maxTreeDepth = maxTreeDepth - 1;
          
        builder.trainingSet = bestSplit.match;
        var matchSubTree = buildDecisionTree(builder);
          
        builder.trainingSet = bestSplit.notMatch;
        var notMatchSubTree = buildDecisionTree(builder);
          
        return {
            attribute: bestSplit.attribute,
            predicate: bestSplit.predicate,
            predicateName: bestSplit.predicateName,
            pivot: bestSplit.pivot,
            match: matchSubTree,
            notMatch: notMatchSubTree,
            matchedCount: bestSplit.match.length,
            notMatchedCount: bestSplit.notMatch.length
        };
    }

    function predict(tree, item) {
        if (tree.category) {
            return tree.category;
        }

        var attrName = tree.attribute;
        var attrValue = item[attrName];

        var predicate = tree.predicate;

        var pivot = tree.pivot;

        if ((attrValue != null) && predicate(attrValue, pivot)) {
            return predict(tree.match, item);
        } else {
            return predict(tree.notMatch, item);
        }
    }

    function buildRandomForest(builder, treesNumber) {
        var items = builder.trainingSet;
          
        var trainingSets = [];
        for (var t = 0; t < treesNumber; t++) {
            trainingSets[t] = [];
        }
        for (var i = 0; i < items.length; i++) {
          var correspondingTree = i % treesNumber;
          trainingSets[correspondingTree].push(items[i]);
        }

        var forest = [];
        for (var t = 0; t < treesNumber; t++) {
            builder.trainingSet = trainingSets[t];

            var tree = new DecisionTree(builder);
            forest.push(tree);
        }
        return forest;
    }

    function predictRandomForest(forest, item) {
        var result = {};
        for (var i in forest) {
            var tree = forest[i];
          
            var prediction = tree.predict(item);
            if (result[prediction]) {
                result[prediction] += 1;
            } else {
                result[prediction] = 1;
            }
        }
        return result;
    }

    var exports = {};
    exports.DecisionTree = DecisionTree;
    exports.RandomForest = RandomForest;
    return exports;
})();